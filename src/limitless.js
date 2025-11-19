const axios = require('axios');
const { ethers } = require('ethers');
const { print } = require('./utils.js');

const CONDITIONALTOKENS_ADDRESS = '0xC9c98965297Bc527861c898329Ee280632B76e18';
const CONFIRMATIONS = 2;

const CONDITIONALTOKENS_ABI = [
  {
    "constant": false,
    "inputs": [
      {
        "name": "collateralToken",
        "type": "address"
      },
      {
        "name": "parentCollectionId",
        "type": "bytes32"
      },
      {
        "name": "conditionId",
        "type": "bytes32"
      },
      {
        "name": "indexSets",
        "type": "uint256[]"
      }
    ],
    "name": "redeemPositions",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const DOMAIN = {
  "name": "Limitless CTF Exchange",
  "version": "1",
  "chainId": 8453,
  "verifyingContract": "0xa4409d988ca2218d956beefd3874100f444f0dc3"
}

class LimitlessSDK {
  constructor(options = {}) {
    const provider = new ethers.JsonRpcProvider(options.rpc);
    this.wallet = new ethers.Wallet(options.pk, provider);
    this.cookie = null;
    this.user = null;
    this.debug = options.debug;
    axios.interceptors.response.use(response => {
      const cookies = response.headers['set-cookie'];
      if (Array.isArray(cookies) && cookies.length > 0) {
        this.cookie = cookies;
      }
      return response;
    });
    axios.interceptors.request.use(config => {
      if (this.cookie) {
        config.headers.Cookie = this.cookie.join('; ');
      }
      return config;
    });
  }

  _getPositions() {
    return axios.get('https://api.limitless.exchange/portfolio/positions').then(res => res.data);
  }

  async getPositionsBySlug(slug) {
    const positions = await this._getPositions();
    return (positions?.clob || [])?.find(e => e.market.slug === slug);
  }

  getMarketDetail(slug) {
    return axios.get(`https://api.limitless.exchange/markets/${slug}`).then(res => res.data);
  }

  _orders(order) {
    return axios.post('https://api.limitless.exchange/orders', order).then(res => res.data);
  }

  getOrderBook(slug) {
    return axios.get(`https://api.limitless.exchange/markets/${slug}/orderbook`).then(res => res.data);
  }

  getUserOrders(slug) {
    return axios.get(`https://api.limitless.exchange/markets/${slug}/user-orders`).then(res => res.data);
  }

  async claimRewards() {
    const positions = await this._getPositions();
    const claims = (positions?.clob || []).filter(e =>
      e.market.closed &&
      (Number(e.positions.yes.unrealizedPnl) > 0 || Number(e.positions.no.unrealizedPnl) > 0));
    const conditional = new ethers.Contract(CONDITIONALTOKENS_ADDRESS, CONDITIONALTOKENS_ABI, this.wallet);

    if (claims.length === 0) {
      print(`🤨 no claims`);
    }
    for (let claim of claims) {
      const { collateralToken, conditionId } = claim.market;
      const tx = await conditional.redeemPositions(collateralToken.address, '0x0000000000000000000000000000000000000000000000000000000000000000', conditionId, ['1', '2']);
      print(`🧾 claim tx: ${tx.hash}`);
      const receipt = await tx.wait(CONFIRMATIONS);
      print(`✅ claim completed in block ${receipt.blockNumber}`)
    }
  }

  fetchMarket(priceOracleId, frequency) {
    return axios.get(`https://api.limitless.exchange/markets/prophet?priceOracleId=${priceOracleId}&frequency=${frequency}`).then(res => res.data);
  }

  async buy({ tokenId, makerAmount, feeRateBps, marketSlug }) {
    return this._order({ tokenId, makerAmount, feeRateBps, marketSlug, side: 0 });
  }

  async sell({ tokenId, makerAmount, feeRateBps, marketSlug }) {
    return this._order({ tokenId, makerAmount, feeRateBps, marketSlug, side: 1 });
  }

  async _order({ tokenId, makerAmount, feeRateBps, marketSlug, side }) {
    const order = {
      salt: Date.now(),
      maker: this.wallet.address,
      signer: this.wallet.address,
      taker: '0x0000000000000000000000000000000000000000',
      tokenId,
      makerAmount: Number(makerAmount),
      takerAmount: 1,
      expiration: '0',
      nonce: 0,
      feeRateBps: feeRateBps ? Number(feeRateBps) : 300,
      side,
      signatureType: 0,
    }
    const signature = await this.wallet.signTypedData(DOMAIN, {
      "Order": [
        {
          "name": "salt",
          "type": "uint256"
        },
        {
          "name": "maker",
          "type": "address"
        },
        {
          "name": "signer",
          "type": "address"
        },
        {
          "name": "taker",
          "type": "address"
        },
        {
          "name": "tokenId",
          "type": "uint256"
        },
        {
          "name": "makerAmount",
          "type": "uint256"
        },
        {
          "name": "takerAmount",
          "type": "uint256"
        },
        {
          "name": "expiration",
          "type": "uint256"
        },
        {
          "name": "nonce",
          "type": "uint256"
        },
        {
          "name": "feeRateBps",
          "type": "uint256"
        },
        {
          "name": "side",
          "type": "uint8"
        },
        {
          "name": "signatureType",
          "type": "uint8"
        }
      ]
    }, order);
    order.signature = signature;

    const obj = {
      order,
      ownerId: this.user.id,
      orderType: 'FOK',
      marketSlug,
    }

    const res = await this._orders(obj);
    if (res?.order) {
      print('✅ order successful');
    } else {
      print('❌ order failure');
    }
  }

  async _getMessage() {
    return axios.get('https://api.limitless.exchange/auth/signing-message').then(res => res.data);
  }

  async login() {
    const message = await this._getMessage();
    this.user = await axios.post('https://api.limitless.exchange/auth/login',
      {
        client: 'eoa',
        smartWallet: this.wallet.address,
        r: ''
      },
      {
        timeout: 15000,
        headers: {
          'x-account': this.wallet.address,
          'x-signing-message': '0x' + Buffer.from(message, 'utf8').toString('hex'),
          'x-signature': await this.wallet.signMessage(message),
          'Content-Type': 'application/json'
        }
      }
    ).then(res => res.data);

    return this.user;
  }
}

module.exports = { LimitlessSDK };
