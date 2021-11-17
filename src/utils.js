module.exports.capitalize = (s) => {
    if (typeof s !== 'string') return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

module.exports.createHeaders = (options) => {
    const {
        authToken
    } = options;

    return {
        'accept': 'application/json',
        'X-AUTH-TOKEN': authToken
    };
};
