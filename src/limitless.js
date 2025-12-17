const axios = require('axios');
const { ethers } = require('ethers');
const { print } = require('./utils.js');

const CONDITIONALTOKENS_ADDRESS = '0xC9c98965297Bc527861c898329Ee280632B76e18';
const CTF_ADDRESS = '0xF1De958F8641448A5ba78c01f434085385Af096D';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CONFIRMATIONS = 2;

const USDC_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
];

const CONDITIONALTOKENS_ABI = [
  {
    "constant": true,
    "inputs": [
      {
        "name": "owner",
        "type": "address"
      },
      {
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
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
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "operator",
        "type": "address"
      },
      {
        "name": "approved",
        "type": "bool"
      }
    ],
    "name": "setApprovalForAll",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "owner",
        "type": "address"
      },
      {
        "name": "operator",
        "type": "address"
      }
    ],
    "name": "isApprovedForAll",
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
];

const DOMAIN = {
  "name": "Limitless CTF Exchange",
  "version": "1",
  "chainId": 8453,
  "verifyingContract": CTF_ADDRESS
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

  async init(amount) {
    print('check USDC...');
    const USDC = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.wallet);
    const allowanceAmount = await USDC.allowance(this.wallet.address, CTF_ADDRESS);
    if (allowanceAmount < amount) {
      print(`amount less then allowance`);
      print(`approve USDC... `);
      const tx = await conditional.approve(CTF_ADDRESS, amount);
      print(`🧾 approve USDC tx: ${tx.hash}`);
      const receipt = await tx.wait(CONFIRMATIONS);
      print(`✅ approve USDC completed in block ${receipt.blockNumber}`);
    } else {
      print(`USDC already approved`);
    }

    print('check 1155 NFT...');
    const conditional = new ethers.Contract(CONDITIONALTOKENS_ADDRESS, CONDITIONALTOKENS_ABI, this.wallet);
    const isApproved = await conditional.isApprovedForAll(this.wallet.address, CTF_ADDRESS);
    if (!isApproved) {
      print(`setApprovalForAll... `);
      const tx = await conditional.setApprovalForAll(CTF_ADDRESS, true);
      print(`🧾 approve nft tx: ${tx.hash}`);
      const receipt = await tx.wait(CONFIRMATIONS);
      print(`✅ approve nft completed in block ${receipt.blockNumber}`);
    } else {
      print(`1155 NFT already approved`);
    }
  }

  async getPositionsBySlug(slug) {
    const positions = await this._getPositions();
    return (positions?.clob || [])?.find(e => e.market.slug === slug);
  }

  async hasOrder(positionId) {
    const conditional = new ethers.Contract(CONDITIONALTOKENS_ADDRESS, CONDITIONALTOKENS_ABI, this.wallet);
    return await conditional.balanceOf(this.wallet.address, positionId) > 0n;
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
      !e.market.negRiskRequestId);
    const conditional = new ethers.Contract(CONDITIONALTOKENS_ADDRESS, CONDITIONALTOKENS_ABI, this.wallet);

    if (claims.length === 0) {
      print(`🤨 no claims`);
    }
    for (let claim of claims) {
      const { collateralToken, conditionId } = claim.market;
      const tx = await conditional.redeemPositions(collateralToken.address, '0x0000000000000000000000000000000000000000000000000000000000000000', conditionId, ['1', '2']);
      print(`🧾 claim tx: ${tx.hash}`);
      const receipt = await tx.wait(CONFIRMATIONS);
      print(`✅ claim completed in block ${receipt.blockNumber}`);
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
