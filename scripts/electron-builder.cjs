const pkg = require('../package.json');
// Keychain's “Always Allow” associates access with the application it sees.
// A versioned bundle/executable made every release look like a different app and
// caused a fresh macOS authorization prompt. Version remains in Info.plist and
// the release notes; the macOS application identity must stay constant.
module.exports = {...pkg.build, productName: '聊单助手', executableName: '聊单助手'};
