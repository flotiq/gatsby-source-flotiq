const {
    CTD1, 
    CTD1_STR, 
    CTD1_OBJECT1,
    CTD1_OBJECT1_DATA, 
    CTD1_OBJECT1_STR, 
    CTD1_OBJECT2_DATA, 
    CTD1_OBJECT2 } = require('./content-types.mocks')
const { when } = require('jest-when');

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
    test('Downloads the data from scratch', async () => {
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

        when(fetch)
            .expectCalledWith(expect.stringContaining(`${options.baseUrl}/api/v1/internal/contenttype`), expectedHeaders)
            .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_STR}]}`)))

        when(fetch)
            .expectCalledWith(expect.stringContaining(`${options.baseUrl}/api/v1/content/${CTD1.name}`), expectedHeaders)
            .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_OBJECT1_STR}]}`)))

        await sourceNodes(gatsbyFunctions, options)
    
        expect(gatsbyFunctions.schema.buildObjectType).toHaveBeenCalledTimes(1)
        expect(actions.createNode).toHaveBeenCalledWith(expect.objectContaining(CTD1_OBJECT1_DATA))
    });

    describe('When launched second time', () => {
        test('Removes outdated data', async () => {
            const actions = mockFunctions(['createNode','setPluginStatus','touchNode','deleteNode']);
            const LAST_UPDATE = '2020-01-01T00:00:00Z';
            const gatsbyFunctions = {
                actions, 
                store: {getState: jest.fn(_ => {return { status: {plugins: {
                    'gatsby-source-flotiq': {
                        updated_at: '2020-01-01T00:00:00Z'
                    }
                }} }})}, 
                getNodes: jest.fn().mockName('getNodes').mockReturnValue([
                    {id: `${CTD1.name}_${CTD1_OBJECT1.id}`, ...CTD1_OBJECT1_DATA, internal: {owner: 'gatsby-source-flotiq'}}
                ]), 
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
        
            when(fetch)
                .calledWith(expect.stringContaining(`${options.baseUrl}/api/v1/internal/contenttype`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_STR}]}`)))
    
            when(fetch)
                .calledWith(expect.stringMatching(`${options.baseUrl}/api/v1/content/${CTD1.name}.*updatedAt.*${encodeURIComponent(LAST_UPDATE)}`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`{"data": []}`)))
    
            when(fetch)
                .calledWith(expect.stringMatching(`${options.baseUrl}/api/v1/content/${CTD1.name}/removed\\?deletedAfter=${encodeURIComponent(LAST_UPDATE)}`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`["${CTD1_OBJECT1.id}"]`)))
        
            await sourceNodes(gatsbyFunctions, options)
            
            expect(actions.deleteNode).toBeCalledWith({node: expect.objectContaining({id: expect.stringContaining(CTD1_OBJECT1.id)})})
        });
    
        test('Updates only new data', async () => {
            const actions = mockFunctions(['createNode','setPluginStatus','touchNode','deleteNode']);
            const LAST_UPDATE = '2020-01-01T00:00:00Z';
            const gatsbyFunctions = {
                actions, 
                store: {getState: jest.fn(_ => {return { status: {plugins: {
                    'gatsby-source-flotiq': {
                        updated_at: '2020-01-01T00:00:00Z'
                    }
                }} }})}, 
                getNodes: jest.fn().mockName('getNodes').mockReturnValue([
                    {id: `${CTD1.name}_${CTD1_OBJECT1.id}`, ...CTD1_OBJECT1_DATA, internal: {owner: 'gatsby-source-flotiq'}},
                    {id: `${CTD1.name}_${CTD1_OBJECT2.id}`, ...CTD1_OBJECT2_DATA, internal: {owner: 'gatsby-source-flotiq'}}
                ]), 
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
        
            when(fetch)
                .calledWith(expect.stringContaining(`${options.baseUrl}/api/v1/internal/contenttype`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_STR}]}`)))
    
            when(fetch)
                .calledWith(expect.stringMatching(`${options.baseUrl}/api/v1/content/${CTD1.name}.*updatedAt.*${encodeURIComponent(LAST_UPDATE)}`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_OBJECT1_STR}]}`)))
    
            when(fetch)
                .calledWith(expect.stringMatching(`${options.baseUrl}/api/v1/content/${CTD1.name}/removed\\?deletedAfter=${encodeURIComponent(LAST_UPDATE)}`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`[]`)))
  
            await sourceNodes(gatsbyFunctions, options)
            expect(actions.touchNode).toBeCalledTimes(2)
        });    
    })
})

