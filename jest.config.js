module.exports = async () => {
    return {
        verbose: true,
        testPathIgnorePatterns: ["/node_modules/", '.*\.mocks\.js'],
        rootDir: __dirname,
        clearMocks: true
    };
};