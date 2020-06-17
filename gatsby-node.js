const fetch = require('node-fetch');
const {createContentDigest} = require(`gatsby-core-utils`);

const digest = str => createContentDigest(str);

let headers = {
    'accept': 'application/json',
};
let apiUrl;

let typeDefinitionsDeferred;
let typeDefinitionsPromise = new Promise((resolve, reject) => {
    typeDefinitionsDeferred = {resolve: resolve, reject: reject};
});

let createNodeGlobal;
let resolveMissingRelationsGlobal;

exports.sourceNodes = async (gatsbyFunctions, options) => {

    const {actions, store, getNodes, reporter, schema} = gatsbyFunctions;
    const {createNode, setPluginStatus, touchNode, deleteNode} = actions;
    const {
        baseUrl,
        authToken,
        forceReload,
        objectLimit = 100000,
        timeout = 5000,
        includeTypes = null,
        resolveMissingRelations = true
    } = options;

    createNodeGlobal = createNode;
    resolveMissingRelationsGlobal = resolveMissingRelations;
    apiUrl = baseUrl;
    headers['X-AUTH-TOKEN'] = authToken;
    if (!apiUrl) {
        reporter.panic('FLOTIQ: You must specify API url ' +
            '(in most cases it is "https://api.flotiq.com")');
    }
    if (!authToken) {
        reporter.panic("FLOTIQ: You must specify API token " +
            "(if you don't know what it is check: https://flotiq.com/docs/API/)");
    }

    if (includeTypes && (!Array.isArray(includeTypes) || typeof includeTypes[0] !== "string")) {
        reporter.panic("FLOTIQ: `includeTypes` should be an array of content type api names. It cannot be empty.");
    }

    let contentTypeDefinitionsResponse = await fetch(
        apiUrl + '/api/v1/internal/contenttype?limit=10000&order_by=label',
        {
            headers: headers,
            timeout: timeout
        });

    if (contentTypeDefinitionsResponse.ok) {
        if (forceReload) {
            setPluginStatus({'updated_at': null});
        }
        let lastUpdate = store.getState().status.plugins['gatsby-source-flotiq'];
        let contentTypeDefinitions = await contentTypeDefinitionsResponse.json();
        const contentTypeDefsData = contentTypeDefinitions.data.filter(
            contentTypeDef => !includeTypes || includeTypes.indexOf(contentTypeDef.name) > -1);
        const existingNodes = getNodes().filter(
            n => n.internal.owner === `gatsby-source-flotiq`
        );
        existingNodes.forEach(n => touchNode({nodeId: n.id, plugin: 'gatsby-source-flotiq'}));
        if (!existingNodes.length) {
            lastUpdate = undefined;
        }
        createTypeDefs(contentTypeDefsData, schema);

        let changed = 0;
        let removed = 0;
        await Promise.all(contentTypeDefsData.map(async ctd => {
            let url = apiUrl + '/api/v1/content/' + ctd.name + '?limit=' + objectLimit;

            if (lastUpdate && lastUpdate.updated_at) {
                url += '&filters=' + encodeURIComponent(JSON.stringify({
                    "internal.updatedAt": {
                        "type": "greaterThan",
                        "filter": lastUpdate.updated_at
                    }
                }))
            }
            let response = await fetch(url, {headers: headers, timeout: timeout});
            reporter.info(`Fetching content type ${ctd.name}: ${url}`);

            if (response.ok) {
                const json = await response.json();
                await Promise.all(json.data.map(async datum => {
                    changed++;
                    return createNode({
                        ...datum,
                        // custom
                        flotiqInternal: datum.internal,
                        // required
                        id: ctd.name === '_media' ? datum.id : ctd.name + '_' + datum.id,
                        parent: null,
                        children: [],
                        internal: {
                            type: capitalize(ctd.name),
                            contentDigest: digest(JSON.stringify(datum)),
                        },
                    });

                }));
            } else {
                reporter.warn('Error fetching data', response);
            }
            if(lastUpdate && lastUpdate.updated_at) {
                url = apiUrl + '/api/v1/content/' + ctd.name + '/removed?deletedAfter=' + encodeURIComponent(lastUpdate.updated_at);
                response = await fetch(url, {headers: headers});
                reporter.info(`Fetching removed content type ${ctd.name}: ${url}`);
                if (response.ok) {
                    const jsonRemoved = await response.json();
                    await Promise.all(jsonRemoved.map(async id => {
                        removed++;
                        let node = existingNodes.find(n => n.id === ctd.name + '_' + id);
                        return deleteNode({node: node});
                    }));
                }
            }
        }));
        if (changed) {
            reporter.info('Updated entries ' + changed);
        }
        if(removed) {
            reporter.info('Removed entries ' + removed);
        }
        setPluginStatus({'updated_at':
                (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')});
    } else {
        if (contentTypeDefinitionsResponse.status === 404) {
            reporter.panic('FLOTIQ: We couldn\'t connect to API. Check if you specified correct API url ' +
                '(in most cases it is "https://api.flotiq.com")');
        }
        if (contentTypeDefinitionsResponse.status === 403) {
            reporter.panic('FLOTIQ: We couldn\'t authorize you in API. Check if you specified correct API token ' +
                '(if you don\'t know what it is check: https://flotiq.com/docs/API/)');
        }
    }
    return {};
};

exports.createSchemaCustomization = ({actions}) => {
    const {createTypes} = actions;

    typeDefinitionsPromise.then(typeDefs => {
        typeDefs.push(`type FlotiqInternal {
          createdAt: String!
          deletedAt: String!
          updatedAt: String!
          contentType: String!
        }
        type FlotiqGeo {
            lat: Float
            lng: Float
        }`);
        createTypes(typeDefs);
    })

};

const createTypeDefs = (contentTypesDefinitions, schema) => {
    let typeDefs = [];
    contentTypesDefinitions.forEach(ctd => {
        let tmpDef = {
            name: capitalize(ctd.name),
            fields: {},
            interfaces: ["Node"],
        };
        Object.keys(ctd.schemaDefinition.allOf[1].properties).forEach(property => {
            tmpDef.fields[property] = getType(
                ctd.metaDefinition.propertiesConfig[property],
                ctd.schemaDefinition.required.indexOf(property) > -1,
                property,
                capitalize(ctd.name)
            );
            if (ctd.metaDefinition.propertiesConfig[property].inputType === 'object') {
                let additionalDef = {
                    name: capitalize(property) + capitalize(ctd.name),
                    fields: {},
                    interfaces: ["Node"],
                };
                Object.keys(ctd.metaDefinition.propertiesConfig[property].items.propertiesConfig).forEach(prop => {
                    additionalDef.fields[prop] = getType(
                        ctd.metaDefinition.propertiesConfig[property].items.propertiesConfig[prop],
                        false,
                        prop,
                        capitalize(ctd.name)
                    );
                });
                additionalDef.fields.flotiqInternal = `FlotiqInternal!`;
                typeDefs.push(schema.buildObjectType(additionalDef));
            }
        });

        tmpDef.fields.flotiqInternal = `FlotiqInternal!`;
        typeDefs.push(schema.buildObjectType(tmpDef));
    });
    typeDefinitionsDeferred.resolve(typeDefs);
};

const capitalize = (s) => {
    if (typeof s !== 'string') return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const getType = (propertyConfig, required, property, ctdName) => {
    switch (propertyConfig.inputType) {
        case 'text':
        case 'textarea':
        case 'richtext':
        case 'email':
        case 'radio':
        case 'select':
            return 'String' + (required ? '!' : '');
        case 'number':
            return 'Int' + (required ? '!' : '');
        case 'checkbox':
            return 'Boolean' + (required ? '!' : '');
        case 'geo':
            return 'FlotiqGeo' + (required ? '!' : '');
        case 'datasource':
            let type = (propertyConfig.validation.relationContenttype !== '_media' ?
                capitalize(propertyConfig.validation.relationContenttype) : '_media');
            let typeNonCapitalize = (propertyConfig.validation.relationContenttype !== '_media' ?
                propertyConfig.validation.relationContenttype : '_media');
            return {
                type: '[' + type + ']',
                resolve: async (source, args, context, info) => {
                    if (source[property]) {
                        let nodes = await Promise.all(source[property].map(async (prop) => {
                            if(typeof(prop.dataUrl) === 'undefined'){
                                    return;
                            }
                            let node = {
                                id: typeNonCapitalize === '_media' ?
                                    prop.dataUrl.split('/')[5] : typeNonCapitalize + '_' + prop.dataUrl.split('/')[5],
                                type: type,
                            };
                            let nodeModel = context.nodeModel.getNodeById(node);
                            if (nodeModel === null && resolveMissingRelationsGlobal) {
                                let url = apiUrl + prop.dataUrl;
                                let response = await fetch(url, {headers: headers});
                                if (response.ok) {
                                    const json = await response.json();
                                    await createNodeGlobal({
                                        ...json,
                                        // custom
                                        flotiqInternal: json.internal,
                                        // required
                                        id: typeNonCapitalize === '_media' ? json.id : typeNonCapitalize + '_' + json.id,
                                        parent: null,
                                        children: [],
                                        internal: {
                                            type: capitalize(typeNonCapitalize),
                                            contentDigest: digest(JSON.stringify(json)),
                                        },
                                    });
                                    nodeModel = context.nodeModel.getNodeById(node);
                                    return nodeModel;
                                } else {
                                    return nodeModel;
                                }
                            } else {
                                return nodeModel
                            }
                        }));
                        if(!nodes[0]) {
                            return [];
                        }
                        return nodes;
                    }
                    return null;
                }
            };
        case 'object':
            return '[' + capitalize(property) + ctdName + ']';
    }
};
