const fetch = require('node-fetch');
const crypto = require('crypto');

let headers = {
    'accept': 'application/json',
};
let apiUrl;

let typeDefs = '';

exports.sourceNodes = async ({actions, store, getNodes, cache}, {baseUrl, authToken, forceReload}) => {
    const {createNode, setPluginStatus, touchNode} = actions;
    apiUrl = baseUrl;
    headers['X-AUTH-TOKEN'] = authToken;

    let contentTypeDefinitionsResponse = await fetch(apiUrl + '/api/v1/internal/contenttype?internal=false&limit=10000&order_by=label', {headers: headers});

    if (contentTypeDefinitionsResponse.ok) {
        if(forceReload) {
            setPluginStatus({'updated_at': null});
        }
        const lastUpdate = store.getState().status.plugins['gatsby-source-flotiq'];
        let contentTypeDefinitions = await contentTypeDefinitionsResponse.json();
        const existingNodes = getNodes().filter(
            n => n.internal.owner === `gatsby-source-flotiq`
        );
        createTypeDefs(contentTypeDefinitions.data);
        await Promise.all(contentTypeDefinitions.data.map(async ctd => {
            let filters = lastUpdate && lastUpdate.updated_at ? encodeURIComponent(JSON.stringify({"internal.updatedAt": {
                    "type": "greaterThan",
                    "filter": lastUpdate.updated_at
                }
            })) : '[]';
            let response = await fetch(apiUrl + '/api/v1/content/' + ctd.name + '?hydrate=1&limit=100000&filters=' + filters, {headers: headers});
            if (response.ok) {
                const json = await response.json();
                await Promise.all(json.data.map(async datum => {
                    let nodeDatum = await createDatumDescription(ctd, datum);
                    return createNode({
                        ...nodeDatum,
                        // custom
                        flotiqInternal: datum.internal,
                        // required
                        id: ctd.name + '_' + datum.id,
                        parent: null,
                        children: [],
                        internal: {
                            type: capitalize(ctd.name),
                            contentDigest: crypto
                                .createHash('md5')
                                .update(JSON.stringify(datum))
                                .digest('hex'),
                        },
                    });
                }));
            } else {
                console.log(response);
            }
        }));

        existingNodes.forEach(n => touchNode({ nodeId: n.id }));
        setPluginStatus({'updated_at': (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')});
    } else {
        console.log(contentTypeDefinitionsResponse);
    }
    return {};
};

exports.createSchemaCustomization = ({actions}) => {
    const {createTypes} = actions;
    typeDefs = typeDefs + `
    type FlotiqGallery {
      id: String
      extension: String
    }
    type FlotiqInternal {
      createdAt: String!
      deletedAt: String!
      updatedAt: String!
      contentType: String!
    }
  `;
    createTypes(typeDefs);
};

let createDatumDescription = async (ctd, datum) => {
    let description = {};

    await Promise.all(Object.keys(ctd.schemaDefinition.allOf[1].properties).map(async property => {
        if(typeof datum[property] === 'object' && datum[property].length) {
            await Promise.all(Object.keys(datum[property][0]).map(async key => {
                if(typeof datum[property][0][key] === 'object' && datum[property][0][key].length) {
                    await Promise.all(datum[property].map( async (dat,index) => {
                        await Promise.all(datum[property][index][key].map(async (prop,idx) => {
                            if(typeof prop.dataUrl !== 'undefined') {
                                const response2  = await fetch(apiUrl + prop.dataUrl + '?hydrate=1', {headers: headers});
                                if(response2.ok) {
                                    datum[property][index][key][idx] = await response2.json();
                                }
                            }
                        }))
                    }));
                }
            }));
        }
        description[property] = datum[property];
    }));

    return description;
};

const createTypeDefs = (contentTypesDefinitions) => {
    contentTypesDefinitions.forEach(ctd => {
        let tmpDef = '';
        Object.keys(ctd.schemaDefinition.allOf[1].properties).forEach(property => {
            tmpDef = tmpDef + `
            ` + property + `: ` + getType(ctd.metaDefinition.propertiesConfig[property],ctd.schemaDefinition.required.indexOf(property) > -1)
        });

        tmpDef = tmpDef + `
            flotiqInternal: FlotiqInternal!`;

        typeDefs = typeDefs + `
        type ` + capitalize(ctd.name) + ' implements Node {' + tmpDef + `
        }`;
    });
};

const capitalize = (s) => {
    if (typeof s !== 'string') return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const getType = (propertyConfig, required) => {
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
            return '[' + (propertyConfig.validation.relationContenttype !== '_media' ? capitalize(propertyConfig.validation.relationContenttype) : 'FlotiqGallery') +']';
    }
};