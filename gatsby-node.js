const fetch = require('node-fetch');
const {createContentDigest} = require(`gatsby-core-utils`);

const digest = str => createContentDigest(str);

let headers = {
    'accept': 'application/json',
};
let apiUrl;

let typeDefs = '';

exports.sourceNodes = async ({actions, store, getNodes, getNode, cache, reporter}, {baseUrl, authToken, forceReload}) => {
    const {createNode, setPluginStatus, touchNode, deleteNode} = actions;
    apiUrl = baseUrl;
    headers['X-AUTH-TOKEN'] = authToken;
    if (!apiUrl) {
        reporter.panic('FLOTIQ: You must specify API url (in most cases it is "https://api.flotiq.com")');
    }
    if (!authToken) {
        reporter.panic("FLOTIQ: You must specify API token (if you don't know what it is check: https://flotiq.com/docs/API/)");
    }
    let foreignReferenceMap = {};

    let contentTypeDefinitionsResponse = await fetch(apiUrl + '/api/v1/internal/contenttype?internal=false&limit=10000&order_by=label', {headers: headers});

    if (contentTypeDefinitionsResponse.ok) {
        if (forceReload || process.env.NODE_ENV === 'production') {
            setPluginStatus({'updated_at': null});
        } else {
            foreignReferenceMap = await cache.get('flotiqForeignReferenceMap');
            if (!foreignReferenceMap) {
                foreignReferenceMap = {};
            }
        }
        let lastUpdate = store.getState().status.plugins['gatsby-source-flotiq'];
        let contentTypeDefinitions = await contentTypeDefinitionsResponse.json();
        const existingNodes = getNodes().filter(
            n => n.internal.owner === `gatsby-source-flotiq`
        );
        existingNodes.forEach(n => touchNode({nodeId: n.id, plugin: 'gatsby-source-flotiq'}))
        if (!existingNodes.length) {
            lastUpdate = undefined;
            foreignReferenceMap = {};
        }
        createTypeDefs(contentTypeDefinitions.data);
        let changed = [];
        let count = 0;
        await Promise.all(contentTypeDefinitions.data.map(async ctd => {
            let filters = lastUpdate && lastUpdate.updated_at ? encodeURIComponent(JSON.stringify({
                "internal.updatedAt": {
                    "type": "greaterThan",
                    "filter": lastUpdate.updated_at
                }
            })) : '[]';
            let response = await fetch(apiUrl + '/api/v1/content/' + ctd.name + '?hydrate=1&limit=100000&filters=' + filters, {headers: headers});
            if (response.ok) {
                const json = await response.json();
                await Promise.all(json.data.map(async datum => {
                    let nodeDatum = await createDatumDescription(ctd, datum, foreignReferenceMap);
                    changed.push(ctd.name + '_' + datum.id);
                    let oldNode = getNode(ctd.name + '_' + datum.id);
                    if (oldNode && oldNode.internal.owner === 'gatsby-source-flotiq') {
                        deleteNode(oldNode);
                    }

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
                            contentDigest: digest(JSON.stringify(datum)),
                        },
                    });

                }));
            }
            if (!forceReload) {
                while (changed.length) {
                    count += changed.length;
                    let changed2 = [];
                    await Promise.all(changed.map(async change => {
                        if (typeof foreignReferenceMap !== 'undefined' && typeof foreignReferenceMap[change] !== 'undefined') {
                            await Promise.all(foreignReferenceMap[change].map(async id => {
                                let response3 = await fetch(apiUrl + '/api/v1/content/' + id.ctd + '/' + id.id + '?hydrate=1', {headers: headers});
                                if (response3.ok) {
                                    const json3 = await response3.json();
                                    changed2.push(id.ctd + '_' + json3.id);

                                    let nodeDatum3 = await createDatumDescription(contentTypeDefinitions.data.filter(d => d.name === id.ctd)[0], json3, foreignReferenceMap);
                                    return createNode({
                                        ...nodeDatum3,
                                        // custom
                                        flotiqInternal: json3.internal,
                                        // required
                                        id: id.ctd + '_' + json3.id,
                                        parent: null,
                                        children: [],
                                        internal: {
                                            type: capitalize(id.ctd),
                                            contentDigest: digest(JSON.stringify(json3)),
                                        },
                                    });
                                }
                            }))
                        }
                    }));
                    changed = changed2;
                }
            }
        }));
        if (count) {
            reporter.info('Updated entries ' + count);
        }
        setPluginStatus({'updated_at': (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')});
        await cache.set('flotiqForeignReferenceMap', foreignReferenceMap);
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

let createDatumDescription = async (ctd, datum, foreignReferenceMap) => {
    let description = {};

    await Promise.all(Object.keys(ctd.schemaDefinition.allOf[1].properties).map(async property => {
        if (typeof datum[property] === 'object' && datum[property].length) {
            await Promise.all(Object.keys(datum[property][0]).map(async key => {
                if (key === 'internal') {
                    datum[property][0]['flotiqInternal'] = datum[property][0]['internal'];
                    delete datum[property][0]['internal'];
                }
                if (key === 'id') {
                    if (typeof foreignReferenceMap[datum[property][0]['internal']['contentType'] + '_' + datum[property][0]['id']] === 'undefined') {
                        foreignReferenceMap[datum[property][0]['internal']['contentType'] + '_' + datum[property][0]['id']] = [];
                    }
                    if (!foreignReferenceMap[datum[property][0]['internal']['contentType'] + '_' + datum[property][0]['id']].find((el) => {
                        return el.ctd === ctd.name && el.id === datum.id;
                    })) {
                        foreignReferenceMap[datum[property][0]['internal']['contentType'] + '_' + datum[property][0]['id']].push({
                            ctd: ctd.name,
                            id: datum.id
                        });
                    }
                }
                if (typeof datum[property][0][key] === 'object' && datum[property][0][key].length) {
                    await Promise.all(datum[property].map(async (dat, index) => {
                        await Promise.all(datum[property][index][key].map(async (prop, idx) => {
                            if (typeof prop.dataUrl !== 'undefined') {
                                const response2 = await fetch(apiUrl + prop.dataUrl + '?hydrate=1', {headers: headers});
                                if (response2.ok) {
                                    let tmp = await response2.json();
                                    tmp.flotiqInternal = tmp.internal;
                                    delete tmp.internal;
                                    datum[property][index][key][idx] = tmp;
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
            ` + property + `: ` + getType(ctd.metaDefinition.propertiesConfig[property], ctd.schemaDefinition.required.indexOf(property) > -1)
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
            return '[' + (propertyConfig.validation.relationContenttype !== '_media' ? capitalize(propertyConfig.validation.relationContenttype) : 'FlotiqGallery') + ']';
    }
};
