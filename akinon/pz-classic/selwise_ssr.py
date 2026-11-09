"""Sunucu taraflı Selwise zenginleştirme — Project Zero (Django / Jinja2).

NE YAPAR
--------
Ürün sayfası şablonunuza koyduğunuz bir yuvayı, Selwise'ın panelde hazırlanmış
içeriğiyle **sunucuda** doldurur. Böylece içerik HTML'in kendisinde olur; widget
tarayıcıda bir daha basmaz, yalnızca gösterim ve tıklama ölçümünü devralır.

NEDEN
-----
Selwise'ın istemci tarafı yolu bir alışverişçi için yeterlidir. Ürün sayfasını
okuyan istemcilerin artan bir bölümü için değildir: GPTBot, ClaudeBot,
PerplexityBot ve bütün bağlantı önizleme botları hiç JavaScript çalıştırmaz,
Bing ve Yandex güvenilmez biçimde çalıştırır. Zenginleştirmenin ürünü ürün
sayfasındaki okunabilir metin olduğu için, istemci-yalnız yol tam olarak bu
özelliğin varlık sebebini zayıflatır.

KURULUM
-------
1. Bu dosyayı projenize kopyalayın (örn. ``omnife_project/selwise_ssr.py``).
2. İki ortam değişkeni tanımlayın::

       SELWISE_SITE_KEY=...
       SELWISE_SSR_API_KEY=swpk_live_...      # panelden, ssr_read kapsamıyla
       # opsiyonel
       SELWISE_API_URL=https://api.selwise.com/api/v1
       SELWISE_SSR_TIMEOUT=0.4

3. Jinja2 ortamınıza global olarak ekleyin. Project Zero'da bu, ``jinja2``
   backend'inin ``environment`` fonksiyonunda olur::

       from omnife_project.selwise_ssr import selwise_enrichment

       def environment(**options):
           env = Environment(**options)
           env.globals.update({"selwise_enrichment": selwise_enrichment})
           return env

4. Şablonunuzda çağırın::

       {{ selwise_enrichment("urun-aciklama-alti", product.sku) }}

   Panelde kuralın "Yuva adı" alanına aynı adı yazın ve "Nerede oluşturulur"
   seçeneğini **Sunucu, tarayıcı yedekli** yapın.

İKİ KURAL, İKİSİ DE BİLİNÇLİ
----------------------------
* **Asla patlamaz.** Zaman aşımı, ağ hatası, 4xx, 5xx, bozuk gövde — hepsi boş
  dize döner. Merchant'ın ürün sayfası bizim yüzümüzden bekleyemez ve
  kırılamaz; istemci tarafı yol zaten yedektir.
* **API anahtarı asla tarayıcıya çıkmaz.** Bu çağrı sunucudan sunucuya yapılır.
  Anahtarı bir şablona, bir ``<script>`` bloğuna veya bir JS değişkenine
  yazmayın.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

try:  # pragma: no cover - Django varsa ayarları tercih ederiz
    from django.conf import settings as django_settings
except Exception:  # pragma: no cover
    django_settings = None

try:  # pragma: no cover
    from django.utils.safestring import mark_safe
except Exception:  # pragma: no cover
    def mark_safe(value):  # type: ignore[misc]
        return value

logger = logging.getLogger(__name__)

DEFAULT_API_URL = "https://api.selwise.com/api/v1"

#: Merchant'ın sayfası bizi beklemez. 400 ms, sağlıklı bir çağrının kat kat
#: üstünde ve bir alışverişçinin fark etmeyeceği kadar kısa.
DEFAULT_TIMEOUT_SECONDS = 0.4

#: Süreç içi önbellek. Bir kategori sayfasından gelen aynı ürün kodunun aynı
#: saniye içinde tekrar tekrar sorulmasını engeller; API yanıtı zaten
#: ``Cache-Control: max-age=60`` taşıyor, bu onun süreç içi karşılığıdır.
CACHE_TTL_SECONDS = 60
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_MAX_ENTRIES = 2000

#: Bir yanıtın CSS'i sayfaya yalnızca BİR kez basılır. Aynı bloğu iki yuvada
#: kullanan bir mağazada aynı stil bloğunu iki kez yazmak, tarayıcının işini
#: iki katına çıkarmaktan başka bir şey yapmaz.
_REQUEST_LOCAL = threading.local()


def _setting(name: str, default: str | None = None) -> str | None:
    if django_settings is not None:
        value = getattr(django_settings, name, None)
        if value:
            return str(value)
    return os.environ.get(name, default)


def _api_url() -> str:
    return (_setting("SELWISE_API_URL", DEFAULT_API_URL) or DEFAULT_API_URL).rstrip("/")


def _timeout() -> float:
    raw = _setting("SELWISE_SSR_TIMEOUT")
    try:
        parsed = float(raw) if raw else DEFAULT_TIMEOUT_SECONDS
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT_SECONDS
    return parsed if parsed > 0 else DEFAULT_TIMEOUT_SECONDS


def _cache_get(key: str) -> dict | None:
    now = time.time()
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if not entry:
            return None
        expires_at, payload = entry
        if expires_at <= now:
            _CACHE.pop(key, None)
            return None
        return payload


def _cache_put(key: str, payload: dict) -> None:
    with _CACHE_LOCK:
        # Yeniden başlatılmış bir süreçte sızıntıya dönüşmesin diye sınırlı.
        # Tamamını boşaltmak en ucuz doğru cevap: kaybedilen şey bir pencerelik
        # muhasebe, özelliğin doğruluğu değil.
        if len(_CACHE) > _CACHE_MAX_ENTRIES:
            _CACHE.clear()
        _CACHE[key] = (time.time() + CACHE_TTL_SECONDS, payload)


def _lang() -> str:
    """Sayfanın dili: Django'nun etkin dili (``LocaleMiddleware``).

    API hesabın dillerinden en yakınını seçer; dil gönderilmezse ya da hesapta
    yoksa varsayılan dilde döner. Tek dilli bir mağazada hiçbir şey değişmez.
    """
    try:
        from django.utils.translation import get_language

        return get_language() or ""
    except Exception:  # Django dışı bir çağrı: dil yok, varsayılan dil.
        return ""


def _fetch(code: str, slots: tuple[str, ...], lang: str = "") -> dict | None:
    site_key = _setting("SELWISE_SITE_KEY")
    api_key = _setting("SELWISE_SSR_API_KEY")
    if not site_key or not api_key:
        return None

    params = {"code": code, "slots": ",".join(slots)}
    if lang:
        params["lang"] = lang
    query = urllib.parse.urlencode(params)
    url = f"{_api_url()}/public/sites/{urllib.parse.quote(site_key)}/ssr/enrichments?{query}"

    request = urllib.request.Request(
        url,
        headers={
            "x-selwise-api-key": api_key,
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=_timeout()) as response:
            body = response.read()
        return json.loads(body.decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as error:
        # Fail-open, ve gürültüsüz: bu satır her ürün görüntülemesinde
        # çalışabilir, bu yüzden hata log seviyesi değil.
        logger.info("Selwise SSR isteği başarısız (sayfa etkilenmedi): %s", error)
        return None


def _payload(code: str, slots: tuple[str, ...]) -> dict | None:
    normalized_code = (code or "").strip()
    if not normalized_code or not slots:
        return None

    lang = _lang()
    # Dil anahtarın parçası: aynı ürün her dilde ayrı bir yanıttır.
    cache_key = f"{normalized_code}|{','.join(sorted(slots))}|{lang}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    payload = _fetch(normalized_code, slots, lang)
    if payload is None:
        return None

    _cache_put(cache_key, payload)
    return payload


def _css_once(css: str) -> str:
    """Bu istek içinde daha önce basılmamış CSS'i döndürür."""
    if not css:
        return ""

    emitted = getattr(_REQUEST_LOCAL, "emitted_css", None)
    if emitted is None:
        emitted = set()
        _REQUEST_LOCAL.emitted_css = emitted

    if css in emitted:
        return ""
    emitted.add(css)
    return f"<style>{css}</style>"


def reset_request_state() -> None:
    """İstek başına CSS tekilleştirmesini sıfırlar.

    Gunicorn/uWSGI iş parçacıklarını yeniden kullanır, bu yüzden bir middleware
    ya da ``request_started`` sinyalinden çağırın. Çağırmazsanız en kötü sonuç
    aynı stilin bir isteğin ilk çağrısında basılıp sonrakinde atlanması olur —
    stil zaten sayfada olduğu için görsel bir fark üretmez, ama tekilleştirmenin
    doğruluğu isteklerin sırasına bağlı kalır.
    """
    _REQUEST_LOCAL.emitted_css = set()


def selwise_enrichment(slot: str, code: str, *, with_css: bool = True) -> str:
    """Bir yuvanın sunucuda oluşturulmuş HTML'ini döndürür.

    :param slot: Paneldeki "Yuva adı" (örn. ``urun-aciklama-alti``).
    :param code: Ürünün kodu. Panelde kural hangi kodla yazıldıysa onunla
        eşleşir — ``sku``, ``item_code`` veya sepetin kabul ettiği kod; üçü de
        katalogda çözülür.
    :param with_css: ``False`` verirseniz stil bloğu basılmaz. Yalnızca CSS'i
        ``<head>`` içinde kendiniz basıyorsanız kullanın.

    İçerik yoksa, istek başarısız olursa veya yapılandırma eksikse boş dize
    döner. Çağıran şablonun hiçbir koşul yazmasına gerek yoktur.
    """
    payload = _payload(code, (slot,))
    if not payload:
        return mark_safe("")

    slots = payload.get("slots") or {}
    entry = slots.get(slot) or {}
    html = entry.get("html") or ""
    if not html:
        return mark_safe("")

    css = _css_once(payload.get("css") or "") if with_css else ""
    return mark_safe(f"{css}{html}")


def selwise_enrichment_slots(code: str, *slots: str) -> dict[str, str]:
    """Birden çok yuvayı **tek** HTTP çağrısıyla getirir.

    Bir ürün sayfasında iki üç yuva varsa bunu tercih edin: ``selwise_enrichment``
    her çağrıda ayrı bir istek yapar (aynı süreç önbelleğine düşse bile ilk
    yükte üç ayrı bekleme demektir).

    Şablonda::

        {% set selwise = selwise_enrichment_slots(product.sku, "urun-aciklama-alti", "sepet-ustu") %}
        {{ selwise["css"] }}
        {{ selwise["urun-aciklama-alti"] }}
        ...
        {{ selwise["sepet-ustu"] }}

    Her istenen yuva sonuçta bulunur; içeriği olmayanlar boş dizedir.
    """
    result = {slot: mark_safe("") for slot in slots}
    result["css"] = mark_safe("")

    payload = _payload(code, tuple(slots))
    if not payload:
        return result

    resolved = payload.get("slots") or {}
    for slot in slots:
        result[slot] = mark_safe((resolved.get(slot) or {}).get("html") or "")

    css = payload.get("css") or ""
    result["css"] = mark_safe(_css_once(css))
    return result
