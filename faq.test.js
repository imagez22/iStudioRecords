const { toggleFAQ } = require('./faq');

test('activates first item', () => {
  const items = [{active:false},{active:false}];
  const result = toggleFAQ(items,0);
  expect(result[0].active).toBe(true);
  expect(result[1].active).toBe(false);
});

test('switches from one item to another', () => {
  const items = [{active:true},{active:false}];
  const result = toggleFAQ(items,1);
  expect(result[0].active).toBe(false);
  expect(result[1].active).toBe(true);
});

test('activates third item in larger list', () => {
  const items = [{active:false},{active:false},{active:false}];
  const result = toggleFAQ(items,2);
  expect(result[2].active).toBe(true);
});
