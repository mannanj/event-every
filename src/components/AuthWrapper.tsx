import OwnerBudgetBoundary, { type OwnerBudgetAccess } from './OwnerBudgetBoundary';

export default function AuthWrapper({
  children,
}: {
  children: (access: OwnerBudgetAccess) => React.ReactNode;
}) {
  return <OwnerBudgetBoundary>{children}</OwnerBudgetBoundary>;
}
