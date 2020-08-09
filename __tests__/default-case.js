const {CTD1_STR, CTD1_OBJECT1_DATA, CTD1_OBJECT1_STR} = require('./content-types.mocks')

jest.mock('node-fetch');
const fetch = require('node-fetch');
const {Response} = jest.requireActual('node-fetch');

const {sourceNodes} = require('../gatsby-node');

function mockFunctions(functionNames) {
    return functionNames.reduce((acc, name) => {
        acc[name] = jest.fn().mockName(name)
        return acc;
    }, {})
}

describe('sourceNodes', () => {
    test('downloads all the data', async () => {
        const actions = mockFunctions(['createNode','setPluginStatus','touchNode','deleteNode']);
        const gatsbyFunctions = {
            actions, 
            store: {getState: jest.fn(_ => {return { status: {plugins: {}} }})}, 
            getNodes: jest.fn().mockName('getNodes').mockReturnValue([]), 
            reporter: mockFunctions(['info','panic','warn']),
            schema: mockFunctions(['buildObjectType'])
        };
        const options = {
            baseUrl: 'https://a.b',
            authToken: 'qweasdzxcrtyfghvbnqweasdzxcrtyfg'
        };
    
        const expectedHeaders = expect.objectContaining({
            headers: expect.objectContaining({
                'X-AUTH-TOKEN': options.authToken
            })
        })
    
        fetch
            .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_STR}]}`)))
            .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_OBJECT1_STR}]}`)));
    
        await sourceNodes(gatsbyFunctions, options)
    
        expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining(`${options.baseUrl}/api/v1/internal/contenttype`), expectedHeaders);
        expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining(`${options.baseUrl}/api/v1/content/Type-1`), expectedHeaders);
        expect(actions.createNode).toHaveBeenCalledWith(expect.objectContaining(CTD1_OBJECT1_DATA))
    });
})

