import { CheckoutSteps } from '@/components/checkout/CheckoutSteps';

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container pt-8">
      <CheckoutSteps />
      {children}
    </div>
  );
}
