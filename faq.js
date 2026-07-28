// faq.js
function toggleFAQ(faqItems, index) {
  // Close all items
  faqItems.forEach(item => item.active = false);
  // Open the one clicked
  faqItems[index].active = true;
  return faqItems;
}
module.exports = { toggleFAQ };
