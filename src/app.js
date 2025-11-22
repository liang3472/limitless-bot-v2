require('dotenv').config();
const { LimitlessSDK } = require('./limitless.js');
const { sleep, print } = require('./utils.js');

const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const PRICE_ORACLE_ID = process.env.PRICE_ORACLE_ID || '';
const FREQUENCY = process.env.FREQUENCY || 'hourly';
const FEERATEBPS = process.env.FEERATEBPS || '300';
const TRIGGER_PCT = process.env.TRIGGER_PCT ? Number(process.env.TRIGGER_PCT) : 60;
const TARGET_PROFIT_PCT = process.env.TARGET_PROFIT_PCT ? Number(process.env.TARGET_PROFIT_PCT) : 20;
const BUY_AMOUNT_USDC = process.env.BUY_AMOUNT_USDC ? Number(process.env.BUY_AMOUNT_USDC) : 1;
const START_MINS = process.env.START_MINS ? Number(process.env.START_MINS) : 10;

const limitless = new LimitlessSDK({
  pk: PRIVATE_KEY,
  rpc: RPC_URL,
});

async function onTick() {
  try {
    const { isActive, market: { slug, yesPositionId, noPositionId, createdAt } } = await limitless.fetchMarket(PRICE_ORACLE_ID, FREQUENCY);
    if (new Date(createdAt).valueOf() + START_MINS * 60 * 1000 > Date.now() || !isActive) {
      print(`竞猜未开始或开始时间未满${START_MINS}分钟`);
    } else {
      const currOrder = await limitless.getPositionsBySlug(slug);
      const hasOrder = await limitless.hasOrder(yesPositionId) || await limitless.hasOrder(noPositionId);
      const { adjustedMidpoint } = await limitless.getOrderBook(slug);
      const options = {
        yes: { point: adjustedMidpoint, positionId: yesPositionId },
        no: { point: 1 - adjustedMidpoint, positionId: noPositionId }
      };

      print(`【${slug}】`);

      if (currOrder) {
        const { sell } = (await limitless.getMarketDetail(slug)).tradePrices;
        const { positions, tokensBalance } = currOrder;
        const dir = Number(positions.yes.cost) > 0 ? 'yes' : 'no';
        const marketPrices = {
          yes: sell.market[0],
          no: sell.market[1]
        };

        const pnlPct = (marketPrices[dir] * tokensBalance[dir] - positions[dir].cost) / positions[dir].cost * 100.0;
        print(`选择了 \x1b[1m${dir}\x1b[0m, 持有: $${positions[dir].marketValue / 1000000} 未实现盈亏: ${pnlPct}%`);
        if (pnlPct >= TARGET_PROFIT_PCT && tokensBalance[dir] > BUY_AMOUNT_USDC * 1000000) {
          print('🎫 开始出售...');
          await limitless.sell({
            tokenId: options[dir].positionId,
            makerAmount: tokensBalance[dir] - 10000,
            feeRateBps: FEERATEBPS,
            marketSlug: slug
          });
        }
      }

      const max = Object.values(options).reduce((a, b) => (a.point > b.point ? a : b));
      print(`yes: ${options.yes.point * 100}%, no: ${options.no.point * 100}%`);
      if (!hasOrder && max.point * 100 >= Number(TRIGGER_PCT) && !currOrder) {
        print('🎫 开始投注...');
        await limitless.buy({
          tokenId: max.positionId,
          makerAmount: BUY_AMOUNT_USDC * 1000000,
          feeRateBps: FEERATEBPS,
          marketSlug: slug
        });
      }
    }
  } catch (error) {
    console.error(error);
  }

  await sleep(10 * 1000);
  await onTick();
}

async function main() {
  print('login...');
  await limitless.login();
  await limitless.init(BUY_AMOUNT_USDC * 1000000);

  setInterval(async () => {
    try {
      print('claim...');
      await limitless.claimRewards();
    } catch (error) { }
  }, 10 * 60 * 1000);

  onTick();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});