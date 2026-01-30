import './style.css';

type MarketToken = {
  token_id: string;
  outcome: string;
};

type Market = {
  question: string;
  tokens?: MarketToken[];
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const statusEl = document.querySelector<HTMLDivElement>('#status');
const marketsListEl = document.querySelector<HTMLUListElement>('#markets-list');
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh-button');
const limitInput = document.querySelector<HTMLInputElement>('#limit-input');

function setStatus(message: string, isError = false): void {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function renderMarkets(markets: Market[]): void {
  if (!marketsListEl) {
    return;
  }

  marketsListEl.innerHTML = '';

  if (markets.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'No active markets found.';
    marketsListEl.appendChild(emptyItem);
    return;
  }

  markets.forEach((market) => {
    const listItem = document.createElement('li');
    listItem.className = 'market';

    const title = document.createElement('h3');
    title.textContent = market.question;
    listItem.appendChild(title);

    if (market.tokens && market.tokens.length > 0) {
      const tokenList = document.createElement('ul');
      tokenList.className = 'tokens';
      market.tokens.forEach((token) => {
        const tokenItem = document.createElement('li');
        tokenItem.textContent = `${token.outcome}: ${token.token_id}`;
        tokenList.appendChild(tokenItem);
      });
      listItem.appendChild(tokenList);
    }

    marketsListEl.appendChild(listItem);
  });
}

async function fetchMarkets(): Promise<void> {
  try {
    setStatus('Loading markets...');
    const limitValue = limitInput?.value ? Number.parseInt(limitInput.value, 10) : undefined;
    const query = limitValue ? `?limit=${limitValue}` : '';
    const response = await fetch(`${apiBaseUrl}/api/markets${query}`);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const markets = (await response.json()) as Market[];
    renderMarkets(markets);
    setStatus(`Loaded ${markets.length} market(s).`);
  } catch (error) {
    console.error(error);
    setStatus('Failed to load markets. Check the backend service.', true);
  }
}

refreshButton?.addEventListener('click', () => {
  void fetchMarkets();
});

void fetchMarkets();
