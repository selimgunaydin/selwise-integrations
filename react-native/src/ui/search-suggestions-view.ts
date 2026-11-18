import { createElement as h, Fragment, type ReactElement, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { pickId } from './pick-ids.js';
import type { SearchSettings, SearchTextKey } from '../vendor/search-settings.js';
import type { SearchSuggestionKind, SearchSuggestionSections, SelwiseProduct } from '../types.js';
import type { SearchTextVars } from '../core/search-config.js';
import { formatCategoryName } from '../core/search-format.js';
import { SelwiseImage } from './host-hooks.js';
import { SearchText as Text } from './search-text-view.js';
import { formatSearchPrice } from './search-result-item.js';
import { styler, type SearchTheme } from './search-styles.js';

/** What a suggestion is, for `renderSuggestion`: a term, a category or a product. */
export type SuggestionValue = string | { name: string; imageUrl?: string } | SelwiseProduct;

export interface RenderSuggestionInfo {
  kind: SearchSuggestionKind;
  value: SuggestionValue;
  /** Taps it: reports the tap and runs it (searches the term, browses the category). */
  onPress: () => void;
}

export interface SearchSuggestionsViewProps {
  sections: SearchSuggestionSections;
  settings: SearchSettings;
  theme: SearchTheme;
  locale: string | undefined;
  t: (key: SearchTextKey, vars?: SearchTextVars) => string;
  onPick: (kind: SearchSuggestionKind, value: string | SelwiseProduct) => void;
  onClearRecent: () => void;
  onRemoveRecent: (term: string) => void;
  renderSuggestion?: (info: RenderSuggestionInfo) => ReactNode;
  unstyled?: boolean;
}

/**
 * What the empty search box offers, in the order the merchant arranged
 * (`suggestions.order`): recent searches (with a way to clear them), popular
 * searches, popular categories and popular products. A section the merchant
 * switched off, or that has nothing in it, is not drawn.
 */
export function SearchSuggestionsView(props: SearchSuggestionsViewProps): ReactElement {
  const { sections, settings, theme, locale, t, onPick, onClearRecent, onRemoveRecent, renderSuggestion, unstyled = false } = props;
  const config = settings.suggestions;
  const s = styler(unstyled);

  const heading = (text: string, action?: ReactElement | null) =>
    h(
      View,
      { key: `${text}-heading`, style: s({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }) },
      h(Text, { accessibilityRole: 'header', style: s({ fontSize: 14, fontWeight: '600', color: theme.colors.text }) }, text),
      action ?? null
    );

  const override = (kind: SearchSuggestionKind, value: SuggestionValue, key: string): ReactNode | null => {
    if (typeof renderSuggestion !== 'function') return null;
    const node = renderSuggestion({
      kind,
      value,
      onPress: () => onPick(kind, typeof value === 'string' || 'itemCode' in value ? (value as string | SelwiseProduct) : value.name),
    });
    return h(Fragment, { key }, node);
  };

  const chip = (kind: 'recent' | 'popularSearch', term: string) => {
    const custom = override(kind, term, `${kind}-${term}`);
    if (custom) return custom;
    return h(
      View,
      {
        key: `${kind}-${term}`,
        style: s({
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.chipRadius,
          backgroundColor: theme.colors.background,
        }),
      },
      h(
        Pressable,
        {
          onPress: () => onPick(kind, term),
          accessibilityRole: 'button',
          accessibilityLabel: term,
          style: s({ paddingHorizontal: 12, paddingVertical: 7, minHeight: 32, justifyContent: 'center' }),
        },
        h(Text, { numberOfLines: 1, style: s({ fontSize: 13, color: theme.colors.text }) }, term)
      ),
      kind === 'recent' ? removeButton(term) : null
    );
  };

  const removeButton = (term: string) =>
    h(
      Pressable,
      {
        onPress: () => onRemoveRecent(term),
        accessibilityRole: 'button',
        accessibilityLabel: `${t('clear')}: ${term}`,
        hitSlop: 6,
        style: s({ paddingRight: 10, paddingLeft: 2, minHeight: 32, justifyContent: 'center' }),
      },
      h(Text, { style: s({ fontSize: 15, color: theme.colors.muted }) }, '×')
    );

  const termRow = (kind: 'recent' | 'popularSearch', term: string) => {
    const custom = override(kind, term, `${kind}-${term}`);
    if (custom) return custom;
    return h(
      View,
      { key: `${kind}-${term}`, style: s({ flexDirection: 'row', alignItems: 'center', minHeight: 40 }) },
      h(
        Pressable,
        {
          onPress: () => onPick(kind, term),
          accessibilityRole: 'button',
          accessibilityLabel: term,
          style: s({ flex: 1, minHeight: 40, justifyContent: 'center' }),
        },
        h(Text, { numberOfLines: 1, style: s({ fontSize: 14, color: theme.colors.text }) }, term)
      ),
      kind === 'recent' ? removeButton(term) : null
    );
  };

  const terms = (kind: 'recent' | 'popularSearch', list: string[], display: 'chips' | 'list') =>
    display === 'chips'
      ? h(View, { style: s({ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }) }, ...list.map((term) => chip(kind, term)))
      : h(View, null, ...list.map((term) => termRow(kind, term)));

  const categoryList = sections.popularCategories;
  const categoryName = (name: string) => formatCategoryName(name);
  const categoryView = (display: 'list' | 'cards') =>
    display === 'cards'
      ? h(
          ScrollView,
          { horizontal: true, showsHorizontalScrollIndicator: false, keyboardShouldPersistTaps: 'handled', contentContainerStyle: s({ gap: theme.gap }) },
          ...categoryList.map((category) => {
            const custom = override('popularCategory', category, `category-${category.name}`);
            if (custom) return custom;
            return h(
              Pressable,
              {
                key: `category-${category.name}`,
                onPress: () => onPick('popularCategory', category.name),
                accessibilityRole: 'button',
                accessibilityLabel: categoryName(category.name),
                style: s({ width: 88, alignItems: 'center', gap: 6 }),
              },
              category.imageUrl
                ? h(SelwiseImage, {
                    uri: category.imageUrl,
                    resizeMode: 'cover',
                    style: s({ width: 72, height: 72, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }),
                  })
                : h(View, { style: s({ width: 72, height: 72, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }) }),
              h(Text, { numberOfLines: 2, style: s({ fontSize: 12, textAlign: 'center', color: theme.colors.text }) }, categoryName(category.name))
            );
          })
        )
      : h(
          View,
          null,
          ...categoryList.map((category) => {
            const custom = override('popularCategory', category, `category-${category.name}`);
            if (custom) return custom;
            return h(
              Pressable,
              {
                key: `category-${category.name}`,
                onPress: () => onPick('popularCategory', category.name),
                accessibilityRole: 'button',
                accessibilityLabel: categoryName(category.name),
                style: s({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }),
              },
              category.imageUrl
                ? h(SelwiseImage, {
                    uri: category.imageUrl,
                    resizeMode: 'cover',
                    style: s({ width: 32, height: 32, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }),
                  })
                : null,
              h(Text, { numberOfLines: 1, style: s({ flex: 1, fontSize: 14, color: theme.colors.text }) }, categoryName(category.name))
            );
          })
        );

  const productRow = () =>
    h(
      ScrollView,
      { horizontal: true, showsHorizontalScrollIndicator: false, keyboardShouldPersistTaps: 'handled', contentContainerStyle: s({ gap: theme.gap }) },
      ...sections.popularProducts.map((product) => {
        const custom = override('popularProduct', product, `product-${product.itemCode}`);
        if (custom) return custom;
        const original = Number(product.originalPrice);
        const price = Number(product.price);
        return h(
          Pressable,
          {
            key: `product-${product.itemCode}`,
            onPress: () => onPick('popularProduct', product),
            accessibilityRole: 'button',
            accessibilityLabel: String(product.title || ''),
            style: s({ width: 128, gap: 6 }),
          },
          product.imageUrl
            ? h(SelwiseImage, {
                uri: String(product.imageUrl),
                resizeMode: 'cover',
                style: s({ width: 128, aspectRatio: theme.imageRatio, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }),
              })
            : h(View, { style: s({ width: 128, aspectRatio: theme.imageRatio, borderRadius: theme.radius, backgroundColor: theme.colors.surfaceAlt }) }),
          h(Text, { numberOfLines: 2, style: s({ fontSize: 12, color: theme.colors.text }) }, String(product.title || '')),
          h(
            View,
            { style: s({ flexDirection: 'row', alignItems: 'center', gap: 6 }) },
            h(Text, { style: s({ fontSize: 13, fontWeight: '600', color: theme.colors.text }) }, formatSearchPrice(price, product.currency, locale)),
            Number.isFinite(original) && original > price
              ? h(Text, { style: s({ fontSize: 11, color: theme.colors.muted, textDecorationLine: 'line-through' }) }, formatSearchPrice(original, product.currency, locale))
              : null
          )
        );
      })
    );

  const block = (key: string, ...children: ReactNode[]) =>
    h(View, { key, style: s({ marginBottom: theme.gap * 2 }) }, ...children);

  const drawn = sections.order.map((section) => {
    if (section === 'recent') {
      return block(
        section,
        heading(
          t('recentSearches'),
          h(
            Pressable,
            { onPress: onClearRecent, accessibilityRole: 'button', accessibilityLabel: t('clearRecent'), hitSlop: 8 },
            h(Text, { style: s({ fontSize: 12, color: theme.colors.muted }) }, t('clearRecent'))
          )
        ),
        terms('recent', sections.recent, config.recent.display)
      );
    }
    if (section === 'popularSearches') {
      return block(section, heading(t('popularSearches')), terms('popularSearch', sections.popularSearches, config.popularSearches.display));
    }
    if (section === 'popularCategories') {
      return block(section, heading(t('popularCategories')), categoryView(config.popularCategories.display));
    }
    return block(section, heading(t('popularProducts')), productRow());
  });

  return h(
    ScrollView,
    {
      testID: pickId('container', 'suggestions'),
      keyboardShouldPersistTaps: 'handled',
      keyboardDismissMode: 'on-drag',
      contentContainerStyle: s({ padding: theme.pad }),
    },
    ...drawn
  );
}
