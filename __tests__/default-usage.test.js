const {
    CTD1,
    CTD1_STR,
    CTD1_OBJECT1,
    CTD1_OBJECT1_DATA,
    CTD1_OBJECT1_STR,
    CTD1_OBJECT2_DATA,
    CTD1_OBJECT2 } = require('./content-types.mocks')
const { when , verifyAllWhenMocksCalled, resetAllWhenMocks} = require('jest-when');

jest.mock('node-fetch');
const fetch = require('node-fetch');
const {Response} = jest.requireActual('node-fetch');

const {sourceNodes, onPluginInit} = require('../gatsby-node');

function createObjectWithMethods(functionNames) {
    return functionNames.reduce((acc, name) => {
        acc[name] = jest.fn().mockName(name)
        return acc;
    }, {})
}

beforeEach(() => {
    resetAllWhenMocks()
})
describe('onPluginInit', () => {
    test('Success Init plugin', async () => {
        const gatsbyFunctions = {
            actions: createObjectWithMethods(['createNode']),
            reporter: createObjectWithMethods(['panic', 'info', 'success']),
            schema: createObjectWithMethods(['buildObjectType'])
        };
        const options = {
            baseUrl: "https://api.flotiq.com",
            authToken: 'qweasdzxcrtyfghvbnqweasdzxcrtyfg',
            contentTypeDefinitions: [],
        };

        const expectedHeaders = expect.objectContaining({
            headers: expect.objectContaining({
                'X-AUTH-TOKEN': options.authToken
            })
        })
        when(fetch)
            .expectCalledWith(
                expect.stringContaining(`${options.baseUrl}/api/v1/internal/contenttype`),
                expectedHeaders
            )
            .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_STR}]}`)))

        await onPluginInit(gatsbyFunctions, options);

        verifyAllWhenMocksCalled()
    });

    test('Failed init plugin when no api key', async () => {
        const reporter = createObjectWithMethods(['panic', 'info']);
        const gatsbyFunctions = {
            actions: createObjectWithMethods(['createNode']),
            reporter: reporter,
            schema: createObjectWithMethods(['buildObjectType'])
        };
        const options = {
            authToken: '',
            contentTypeDefinitions: [],
        };

        await onPluginInit(gatsbyFunctions, options);

        expect(reporter.panic).toHaveBeenCalledTimes(1);
    });
});

describe('sourceNodes', () => {
    test('Downloads the data from scratch', async () => {
        const actions = createObjectWithMethods(['createNode','setPluginStatus','touchNode','deleteNode']);
        const gatsbyFunctions = {
            actions,
            store: {getState: jest.fn(_ => {return { status: {plugins: {}} }})},
            getNodes: jest.fn().mockName('getNodes').mockReturnValue([]),
            reporter: createObjectWithMethods(['info','panic','warn']),
            schema: createObjectWithMethods(['buildObjectType'])
        };
        const baseUrl = 'https://api.flotiq.com';
        const options = {
            authToken: 'qweasdzxcrtyfghvbnqweasdzxcrtyfg',
            contentTypeDefinitions: [CTD1]
        };

        const expectedHeaders = expect.objectContaining({
            headers: expect.objectContaining({
                'X-AUTH-TOKEN': options.authToken
            })
        })

        when(fetch)
            .expectCalledWith(
                expect.stringContaining(`${baseUrl}/api/v1/content/Type-1-name?limit=1000&page=1`),
                expectedHeaders
            )
            .mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_OBJECT1_STR}]}`)));

        await sourceNodes(gatsbyFunctions, options)

        verifyAllWhenMocksCalled()
        expect(actions.createNode).toHaveBeenCalledTimes(1);
        expect(actions.setPluginStatus).toHaveBeenCalledTimes(1);
    });

    describe('When launched second time', () => {
        test('Removes outdated data', async () => {
            const actions = createObjectWithMethods(['createNode','setPluginStatus','touchNode','deleteNode']);
            const LAST_UPDATE = '2020-01-01T00:00:00Z';
            const gatsbyFunctions = {
                actions,
                store: {getState: jest.fn(_ => {return { status: {plugins: {
                    'gatsby-source-flotiq': {
                        updated_at: LAST_UPDATE
                    }
                }} }})},
                getNodes: jest.fn().mockName('getNodes').mockReturnValue([
                    {id: `${CTD1.name}_${CTD1_OBJECT1.id}`, ...CTD1_OBJECT1_DATA, internal: {owner: 'gatsby-source-flotiq'}}
                ]),
                getNodesByType: jest.fn().mockName('getNodesByType').mockReturnValue([
                    {id: `${CTD1.name}_${CTD1_OBJECT1.id}`, ...CTD1_OBJECT1_DATA, internal: {owner: 'gatsby-source-flotiq'}}
                ]),
                reporter: createObjectWithMethods(['info','panic','warn']),
                schema: createObjectWithMethods(['buildObjectType'])
            };

            const baseUrl = 'https://api.flotiq.com';
            const options = {
                authToken: 'qweasdzxcrtyfghvbnqweasdzxcrtyfg',
                contentTypeDefinitions: [CTD1],
            };

            const expectedHeaders = expect.objectContaining({
                headers: expect.objectContaining({
                    'X-AUTH-TOKEN': options.authToken
                })
            })

            when(fetch)
                .calledWith(expect.stringMatching(`${baseUrl}/api/v1/content/${CTD1.name}.*updatedAt.*${encodeURIComponent(LAST_UPDATE)}`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`{"data": []}`)))

            when(fetch)
                .calledWith(expect.stringMatching(`${baseUrl}/api/v1/content/${CTD1.name}/removed\\?deletedAfter=${encodeURIComponent(LAST_UPDATE)}`), expectedHeaders)
                .mockReturnValueOnce(Promise.resolve(new Response(`["${CTD1_OBJECT1.id}"]`)))

            await sourceNodes(gatsbyFunctions, options)

            verifyAllWhenMocksCalled()
            expect(actions.deleteNode).toBeCalledWith({node: expect.objectContaining({id: expect.stringContaining(CTD1_OBJECT1.id)})})
        });

        test('Updates only new data', async () => {
            const actions = createObjectWithMethods(['createNode','setPluginStatus','touchNode','deleteNode']);
            const LAST_UPDATE = '2020-01-01T00:00:00Z';

            const gatsbyFunctions = {
                actions,
                store: {getState: jest.fn(_ => {return { status: {plugins: {
                    'gatsby-source-flotiq': {
                        updated_at: LAST_UPDATE
                    }
                }} }})},
                getNodes: jest.fn().mockName('getNodes').mockReturnValue([
                    {id: `${CTD1.name}_${CTD1_OBJECT1.id}`, ...CTD1_OBJECT1_DATA, internal: {owner: 'gatsby-source-flotiq'}},
                    {id: `${CTD1.name}_${CTD1_OBJECT2.id}`, ...CTD1_OBJECT2_DATA, internal: {owner: 'gatsby-source-flotiq'}}
                ]),
                getNodesByType: jest.fn().mockName('getNodesByType').mockReturnValue([
                    {id: `${CTD1.name}_${CTD1_OBJECT1.id}`, ...CTD1_OBJECT1_DATA, internal: {owner: 'gatsby-source-flotiq'}},
                    {id: `${CTD1.name}_${CTD1_OBJECT2.id}`, ...CTD1_OBJECT2_DATA, internal: {owner: 'gatsby-source-flotiq'}}
                ]),
                reporter: createObjectWithMethods(['info','panic','warn']),
                schema: createObjectWithMethods(['buildObjectType'])
            };
            const baseUrl = 'https://api.flotiq.com';
            const options = {
                authToken: 'qweasdzxcrtyfghvbnqweasdzxcrtyfg',
                contentTypeDefinitions: [CTD1],
            };

            const expectedHeaders = expect.objectContaining({
                headers: expect.objectContaining({
                    'X-AUTH-TOKEN': options.authToken
                })
            })

            when(fetch)
                .calledWith(
                    expect.stringMatching(`${baseUrl}/api/v1/content/${CTD1.name}.*updatedAt.*${encodeURIComponent(LAST_UPDATE)}`),
                    expectedHeaders
                ).mockReturnValueOnce(Promise.resolve(new Response(`{"data": [${CTD1_OBJECT1_STR}]}`)))

            when(fetch)
                .calledWith(
                    expect.stringMatching(`${baseUrl}/api/v1/content/${CTD1.name}/removed\\?deletedAfter=${encodeURIComponent(LAST_UPDATE)}`),
                    expectedHeaders
                ).mockReturnValueOnce(Promise.resolve(new Response(`[]`)))

            await sourceNodes(gatsbyFunctions, options)

            verifyAllWhenMocksCalled()
            expect(actions.touchNode).toBeCalledTimes(2)
            expect(actions.createNode).toHaveBeenCalledWith(expect.objectContaining(CTD1_OBJECT1_DATA))
        });
    })
})

