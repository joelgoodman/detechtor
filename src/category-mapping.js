// WebAppAnalyzer category ID to name mapping
const categoryMapping = {
  1: 'CMS',
  2: 'CMS', // WordPress, Drupal etc
  3: 'Message Boards',
  4: 'Wiki',
  5: 'LMS',
  6: 'Web Server', // Apache, Nginx
  7: 'CDN',
  8: 'Programming Language', // PHP, Python, Ruby
  9: 'JavaScript Framework',
  10: 'Analytics',
  11: 'Advertising',
  12: 'JavaScript Framework', // ExtJS
  14: 'Video Platform',
  15: 'Image Processing',
  16: 'Database',
  17: 'JavaScript Framework', // Twemoji
  18: 'Web Server', // IIS
  19: 'Operating System',
  20: 'Web Server', // LiteSpeed
  21: 'Web Server', // Envoy
  22: 'Web Server', // Caddy
  23: 'Web Server', // OpenResty
  24: 'Web Server', // Tengine
  25: 'JavaScript Framework',
  26: 'JavaScript Framework',
  27: 'JavaScript Framework',
  28: 'JavaScript Framework',
  29: 'JavaScript Framework',
  30: 'JavaScript Framework',
  31: 'JavaScript Framework',
  32: 'JavaScript Framework',
  33: 'JavaScript Framework',
  34: 'JavaScript Framework',
  35: 'JavaScript Framework',
  36: 'Advertising',
  37: 'Advertising',
  38: 'Advertising',
  39: 'Advertising',
  40: 'Advertising',
  41: 'Advertising',
  42: 'Advertising',
  43: 'Advertising',
  44: 'Advertising',
  45: 'Advertising',
  46: 'Advertising',
  47: 'Advertising',
  48: 'Advertising',
  49: 'Advertising',
  50: 'Advertising',
  51: 'Advertising',
  52: 'Chatbot',
  53: 'SIS', // Student Information Systems
  54: 'CRM',
  55: 'CRM',
  56: 'CRM',
  57: 'CMS',
  58: 'CMS',
  59: 'JavaScript Framework',
  60: 'JavaScript Framework',
  61: 'JavaScript Framework',
  62: 'JavaScript Framework',
  63: 'JavaScript Framework',
  64: 'JavaScript Framework',
  65: 'JavaScript Framework',
  66: 'JavaScript Framework',
  67: 'JavaScript Framework',
  68: 'JavaScript Framework',
  69: 'JavaScript Framework',
  70: 'JavaScript Framework',
  71: 'Booking System',
  72: 'Booking System',
  73: 'Booking System',
  74: 'Booking System',
  75: 'Booking System',
  76: 'Booking System',
  77: 'Advertising',
  78: 'Advertising',
  79: 'Advertising',
  80: 'CMS',
  81: 'CMS',
  82: 'CMS',
  83: 'CMS',
  84: 'CMS',
  85: 'CMS',
  86: 'CMS',
  87: 'CMS',
  88: 'CMS',
  89: 'CMS',
  90: 'CMS',
  91: 'CMS',
  92: 'CMS',
  93: 'CMS',
  94: 'CMS',
  95: 'CMS',
  96: 'CMS',
  97: 'CMS',
  98: 'CMS',
  99: 'CMS',
  100: 'CMS',
  101: 'CMS',
  102: 'CMS',
  103: 'CMS',
  104: 'CMS',
  105: 'CMS',
  106: 'CMS',
  107: 'Payment Processor',
  108: 'Payment Processor',
  109: 'Payment Processor',
  110: 'Payment Processor'
};

function mapCategory(categoryId) {
  if (typeof categoryId === 'string') {
    return categoryId.toLowerCase();
  }
  if (typeof categoryId === 'number') {
    return categoryMapping[categoryId] || 'Unknown';
  }
  return 'Unknown';
}

module.exports = { mapCategory, categoryMapping };
