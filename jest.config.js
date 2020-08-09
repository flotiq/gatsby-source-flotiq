module.exports = async () => {
    return {
        verbose: false,
        testPathIgnorePatterns: ["/node_modules/", '.*\.mocks\.js'],
        rootDir: __dirname
    };
};