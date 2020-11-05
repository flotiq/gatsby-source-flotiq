module.exports.capitalize = (s) => {
    if (typeof s !== 'string') return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

module.exports.createHeaders = (options) => {
    const {
        authToken
    } = options;

    
    let headers = {
        'accept': 'application/json',
        'X-AUTH-TOKEN': authToken
    };
    return headers;
};