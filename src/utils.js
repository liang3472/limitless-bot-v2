const print = (...args) => {
  console.log(`[${new Date().toLocaleString('zh-CN', { hourCycle: 'h23' })}]`, ...args);
};

const sleep = (t = 200) => new Promise(resolve => setTimeout(resolve, t));

module.exports = { print, sleep };