const pkg = require('../package.json');
// Keep the new product identity and version visible in Finder.
module.exports = {...pkg.build, productName: `聊单助手 ${pkg.version}`};
