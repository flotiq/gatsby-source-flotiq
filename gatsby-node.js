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

exports.sourceNodes = async ({actions, store, getNodes, getNode, cache, reporter, schema}, {baseUrl, authToken, forceReload, includeTypes = null}) => {
    const {createNode, setPluginStatus, touchNode} = actions;
    apiUrl = baseUrl;
    headers['X-AUTH-TOKEN'] = authToken;
    if (!apiUrl) {
        reporter.panic('FLOTIQ: You must specify API url (in most cases it is "https://api.flotiq.com")');
    }
    if (!authToken) {
        reporter.panic("FLOTIQ: You must specify API token (if you don't know what it is check: https://flotiq.com/docs/API/)");
    }

    if (includeTypes && (!Array.isArray(includeTypes) || typeof includeTypes[0] !== "string")) {
        reporter.panic("FLOTIQ: `includeTypes` should be an array of content type api names. It cannot be empty.");
    }

    let contentTypeDefinitionsResponse = await fetch(apiUrl + '/api/v1/internal/contenttype?limit=10000&order_by=label', {headers: headers});

    if (contentTypeDefinitionsResponse.ok) {
        if (forceReload || process.env.NODE_ENV === 'production') {
            setPluginStatus({'updated_at': null});
        }
        let lastUpdate = store.getState().status.plugins['gatsby-source-flotiq'];
        let contentTypeDefinitions = await contentTypeDefinitionsResponse.json();
        const contentTypeDefsData = contentTypeDefinitions.data.filter(contentTypeDef => !includeTypes || includeTypes.indexOf(contentTypeDef.name) > -1);
        const existingNodes = getNodes().filter(
            n => n.internal.owner === `gatsby-source-flotiq`
        );
        existingNodes.forEach(n => touchNode({nodeId: n.id, plugin: 'gatsby-source-flotiq'}));
        if (!existingNodes.length) {
            lastUpdate = undefined;
        }
        createTypeDefs(contentTypeDefsData, schema);

        let changed = 0;
        await Promise.all(contentTypeDefsData.map(async ctd => {

            let url = apiUrl + '/api/v1/content/' + ctd.name + '?limit=100000';


            if (lastUpdate && lastUpdate.updated_at) {
                url += '&filters=' + encodeURIComponent(JSON.stringify({
                    "internal.updatedAt": {
                        "type": "greaterThan",
                        "filter": lastUpdate.updated_at
                    }
                }))
            }
            let response = await fetch(url, {headers: headers});
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
        }));
        reporter.info('Updated entries ' + changed);

        setPluginStatus({'updated_at': (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')});

    } else {
        if (contentTypeDefinitionsResponse.status === 404) {
            reporter.panic('FLOTIQ: We couldn\'t connect to API. Check if you specified correct API url (in most cases it is "https://api.flotiq.com")');
        }
        if (contentTypeDefinitionsResponse.status === 403) {
            reporter.panic('FLOTIQ: We couldn\'t authorize you in API. Check if you specified correct API token (if you don\'t know what it is check: https://flotiq.com/docs/API/)');
        }
    }
    return {};
};

exports.createSchemaCustomization = ({actions, schema}) => {
    const {createTypes} = actions;

    typeDefinitionsPromise.then(typeDefs => {
        typeDefs.push(`type FlotiqInternal {
          createdAt: String!
          deletedAt: String!
          updatedAt: String!
          contentType: String!
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
                    additionalDef.fields[prop] = getType(ctd.metaDefinition.propertiesConfig[property].items.propertiesConfig[prop], false, prop, capitalize(ctd.name));
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
        case 'datasource':
            let type = (propertyConfig.validation.relationContenttype !== '_media' ? capitalize(propertyConfig.validation.relationContenttype) : '_media');
            let typeNonCapitalize = (propertyConfig.validation.relationContenttype !== '_media' ? propertyConfig.validation.relationContenttype : '_media');
            return {
                type: '[' + type + ']',
                resolve: (source, args, context, info) => {
                    return source[property].map((prop) => {
                        let node = {
                            id: typeNonCapitalize === '_media' ? prop.dataUrl.split('/')[5] : typeNonCapitalize + '_' + prop.dataUrl.split('/')[5],
                            type: type,
                        };
                        return context.nodeModel.getNodeById(node)
                    });
                }
            };
        case 'object':
            return '[' + capitalize(property) + ctdName + ']';
    }
};
