// carousel.js
const carousels = {
  studios: { currentIndex: 0, itemsPerView: 3, totalItems: 5 },
  instruments: { currentIndex: 0, itemsPerView: 3, totalItems: 6 }
};

function moveCarousel(carouselType, direction) {
  const carousel = carousels[carouselType];
  carousel.currentIndex += direction;

  const maxIndex = Math.max(0, carousel.totalItems - carousel.itemsPerView);

  if (carousel.currentIndex < 0) carousel.currentIndex = 0;
  if (carousel.currentIndex > maxIndex) carousel.currentIndex = maxIndex;

  return carousel.currentIndex; // return value for testing
}

module.exports = { carousels, moveCarousel };
