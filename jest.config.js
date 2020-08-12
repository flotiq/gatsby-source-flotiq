module.exports = async () => {
    return {
        verbose: true,
        testRegex: "__tests__/.*\\.(spec|test)\\.[jt]s?x?",
        rootDir: __dirname,
        clearMocks: true
    };
};