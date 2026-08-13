import OwnerBudgetBoundary from './OwnerBudgetBoundary';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  return <OwnerBudgetBoundary>{children}</OwnerBudgetBoundary>;
}
