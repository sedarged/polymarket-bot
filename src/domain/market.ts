export interface Market {
  id: string;
  question: string;
  active: boolean;
  closed: boolean;
  marketSlug: string;
  outcomes: string[];
  outcomePrices: string[];
  tokens: Token[];
}

export interface Token {
  token_id: string;
  outcome: string;
  price: string;
  winner: boolean;
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  markets: Market[];
}
