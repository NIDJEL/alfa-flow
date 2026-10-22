export type Actor = {
  id: string;
  name: string;
  role: "client" | "bank_analyst" | "demo_admin";
  company_id?: string;
  persona: string;
};
export type Company = {
  id: string;
  name: string;
  persona: string;
  tax_id: string;
  contact: string;
  declared_revenue_kopeks: number;
  history_months: number;
  opening_balance_kopeks: number;
  legal_status: string;
};
export type Params = {
  product_id: string;
  purpose: string;
  amount_kopeks: number;
  term_months: number;
  declared_revenue_kopeks: number;
};
export type Product = {
  id: string;
  name: string;
  version: string;
  apr_basis_points: number;
  min_amount_kopeks: number;
  max_amount_kopeks: number;
  min_term_months: number;
  max_term_months: number;
  purpose: string;
  required_document?: string;
  fee_kopeks: number;
};
export type Payment = {
  month: number;
  payment_kopeks: number;
  principal_kopeks: number;
  interest_kopeks: number;
  balance_kopeks: number;
};
export type Schedule = {
  monthly_payment_kopeks: number;
  total_payment_kopeks: number;
  total_interest_kopeks: number;
  apr_basis_points: number;
  payments: Payment[];
};
export type Rule = {
  id: string;
  message: string;
  input?: string;
  threshold?: string;
};
export type Alternative = {
  params: Params;
  schedule: Schedule;
  coverage_ratio: number | null;
  reason: string;
};
export type Evaluation = {
  outcome: string;
  risk_band: string;
  triggered_rules: Rule[];
  schedule: Schedule;
  coverage_ratio: number | null;
  available_cash_kopeks: number;
  existing_debt_kopeks: number;
  alternatives: Alternative[];
};
export type Decision = {
  decision_id: string;
  input_sha256: string;
  ruleset_version: string;
  product_version: string;
  engine_version: string;
  application_revision: number;
  result: Evaluation;
  created_at: string;
  actor?: string;
  input_snapshot_json?: {
    company: Company;
    params: Params;
    mock_checks: Check[];
    policy: object;
    manual_reason?: string;
  };
};
export type Check = {
  id: string;
  provider: string;
  status: string;
  source: string;
  detail: string;
};
export type AppEvent = {
  id: string;
  type: string;
  from: string;
  to: string;
  actor: string;
  note: string;
  at: string;
};
export type Offer = {
  id: string;
  revision: number;
  type: string;
  params: Params;
  schedule: Schedule;
  decision_id: string;
  expires_at: string;
  created_at: string;
};
export type Document = {
  id: string;
  kind: string;
  name: string;
  sha256: string;
  size_bytes: number;
  source: string;
};
export type Application = {
  id: string;
  company_id: string;
  company_name: string;
  persona: string;
  status: string;
  version: number;
  params: Params;
  documents: Document[];
  decisions: Decision[];
  offers: Offer[];
  active_offer_id?: string;
  accepted_offer_id?: string;
  events: AppEvent[];
  info_requests: {
    id: string;
    message: string;
    open: boolean;
    answer?: string;
  }[];
  disbursement_id?: string;
  created_at: string;
  updated_at: string;
};
export type Transaction = {
  id: string;
  date: string;
  amount_kopeks: number;
  direction: string;
  category: string;
  description: string;
  recurring: boolean;
};
export type Cashflow = {
  transactions: Transaction[];
  monthly: {
    month: string;
    inflow_kopeks: number;
    operating_kopeks: number;
    debt_kopeks: number;
    net_kopeks: number;
  }[];
  opening_balance_kopeks: number;
  average_inflow_kopeks: number;
  average_operating_kopeks: number;
  existing_debt_kopeks: number;
  free_cashflow_kopeks: number;
  history_months: number;
  source: string;
};
export type Forecast = {
  points: {
    date: string;
    baseline_kopeks: number;
    funded_kopeks: number;
    lower_kopeks: number;
    upper_kopeks: number;
  }[];
  cash_gap_date: string | null;
  funded_gap_date: string | null;
  forecast_min_balance_kopeks: number;
  funded_min_balance_kopeks: number;
  sufficient_history: boolean;
  assumptions: string[];
};
export type Simulation = {
  scenario_id: string;
  evaluation: Evaluation;
  eligibility: string;
  monthly_payment_kopeks: number;
  total_cost_kopeks: number;
  coverage_ratio: number | null;
  forecast: Forecast;
  alternatives: Alternative[];
  assumptions: string[];
};
