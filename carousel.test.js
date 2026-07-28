const { carousels, moveCarousel } = require('./carousel');

beforeEach(() => {
  carousels.studios.currentIndex = 0;
  carousels.instruments.currentIndex = 0;
});

test('moves forward correctly', () => {
  expect(moveCarousel('studios', 1)).toBe(1);
});

test('does not go below 0', () => {
  expect(moveCarousel('studios', -1)).toBe(0);
});

test('does not exceed max index', () => {
  carousels.instruments.currentIndex = 3; // maxIndex=3
  expect(moveCarousel('instruments', 1)).toBe(3);
});
