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
let downloadMediaFileGlobal = false;

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
        resolveMissingRelations = true,
        downloadMediaFile = false
    } = options;

    createNodeGlobal = createNode;
    resolveMissingRelationsGlobal = resolveMissingRelations;
    downloadMediaFileGlobal = downloadMediaFile;
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
            if (lastUpdate && lastUpdate.updated_at) {
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
        if (removed) {
            reporter.info('Removed entries ' + removed);
        }
        setPluginStatus({
            'updated_at':
                (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        });
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
            lon: Float
        }
        type FlotiqImageFixed implements Node {
            aspectRatio: Float,
            width: Float,
            height: Float,
            src: String,
            srcSet: String,
            originalName: String
        }
        type FlotiqImageFluid implements Node {
            aspectRatio: Float,
            src: String,
            srcSet: String,
            originalName: String,
            sizes: String
        }`);
        createTypes(typeDefs);
    })

};

exports.createResolvers = ({
                               actions,
                               cache,
                               createNodeId,
                               createResolvers,
                               store,
                               reporter,
                           }) => {
    if (downloadMediaFileGlobal) {
        const {createRemoteFileNode} = require(`gatsby-source-filesystem`)
        const {createNode} = actions
        createResolvers({
            _media: {
                localFile: {
                    type: `File`,
                    resolve(source, args, context, info) {
                        return createRemoteFileNode({
                            url: apiUrl + source.url,
                            store,
                            cache,
                            createNode,
                            createNodeId,
                            reporter,
                            ext: '.' + source.extension
                        });
                    }
                }
            }
        })
    }
}

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
        if (ctd.name === '_media' && !downloadMediaFileGlobal) {
            tmpDef.fields.fixed = {
                type: 'FlotiqImageFixed',
                args: {
                    width: 'Int',
                    height: 'Int'
                },
                resolve(source, args) {
                    let width = 0;
                    let height = 0;
                    if (args.width) {
                        width = args.width;
                    }
                    if (args.height) {
                        height = args.height
                    }
                    return {
                        aspectRatio: (args.width && args.height) ? (args.width / args.height) : (source.width / source.height),
                        height: args.height ? args.height : source.height,
                        originalName: source.id + '.' + source.extension,
                        src: apiUrl + source.url.replace('0x0', width + 'x' + height),
                        srcSet: createSrcSetFixed(apiUrl, source, args),
                        width: args.width ? args.width : source.width,
                    }
                }
            };
            tmpDef.fields.fluid = {
                type: 'FlotiqImageFluid',
                args: {
                    maxWidth: 'Int',
                    sizes: 'String'
                },
                resolve(source, args) {
                    return {
                        aspectRatio: source.width / source.height,
                        originalName: source.id + '.' + source.extension,
                        src: apiUrl + (args.maxWidth ? source.url.replace('0x0', args.maxWidth + 'x0') : source.url),
                        srcSet: createSrcSetFluid(apiUrl, source, args),
                        sizes: args.sizes ? args.sizes : '(max-width: ' + (args.maxWidth ? args.maxWidth : source.width) + 'px) 100vw, ' + (args.maxWidth ? args.maxWidth : source.width) + 'px'
                    }
                }
            };
        }

        tmpDef.fields.flotiqInternal = `FlotiqInternal!`;
        typeDefs.push(schema.buildObjectType(tmpDef));
    });
    typeDefinitionsDeferred.resolve(typeDefs);
};

const createSrcSetFluid = (apiUrl, source, args) => {
    let array = [];
    if (!args.maxWidth) {
        if (source.width >= 200) {
            array.push(apiUrl + '/image/200x0/' + source.id + '.' + source.extension + ' 200w');
            if (source.width >= 400) {
                array.push(apiUrl + '/image/400x0/' + source.id + '.' + source.extension + ' 400w');
                if (source.width >= 800) {
                    array.push(apiUrl + '/image/800x0/' + source.id + '.' + source.extension + ' 800w');
                    if (source.width >= 1200) {
                        array.push(apiUrl + '/image/1200x0/' + source.id + '.' + source.extension + ' 1200w');
                        if (source.width <= 1600) {
                            array.push(apiUrl + '/image/1600x0/' + source.id + '.' + source.extension + ' 1600w');
                            if (source.width >= 1920) {
                                array.push(apiUrl + '/image/1920x0/' + source.id + '.' + source.extension + ' 1920w');
                            }
                        }
                    }
                }
            }
        }
    } else {
        if (args.maxWidth <= source.width) {
            let per25 = args.maxWidth / 4;
            let per50 = args.maxWidth / 2;
            let per150 = args.maxWidth * 1.5;
            let per200 = args.maxWidth * 2;
            array.push(apiUrl + '/image/' + Math.floor(per25) + 'x0/' + source.id + '.' + source.extension + ' ' + per25 + 'w');
            array.push(apiUrl + '/image/' + Math.floor(per50) + 'x0/' + source.id + '.' + source.extension + ' ' + per50 + 'w');
            array.push(apiUrl + '/image/' + args.maxWidth + 'x0/' + source.id + '.' + source.extension + ' ' + args.maxWidth + 'w');
            if (per150 <= source.width) {
                array.push(apiUrl + '/image/' + Math.floor(per150) + 'x0/' + source.id + '.' + source.extension + ' ' + per150 + 'w');
                if (per200 <= source.width) {
                    array.push(apiUrl + '/image/' + Math.floor(per200) + 'x0/' + source.id + '.' + source.extension + ' ' + per200 + 'w');
                }
            }
        } else {
            let per25 = args.maxWidth / 4;
            if (per25 < source.width) {
                array.push(apiUrl + '/image/' + Math.floor(per25) + 'x0/' + source.id + '.' + source.extension + ' ' + per25 + 'w');
                let per50 = args.maxWidth / 2;
                if (per50 < source.width) {
                    array.push(apiUrl + '/image/' + Math.floor(per50) + 'x0/' + source.id + '.' + source.extension + ' ' + per50 + 'w');
                }
            }

            array.push(apiUrl + '/image/' + source.width + 'x0/' + source.id + '.' + source.extension + ' ' + source.width + 'w');
        }
    }
    return array.join(',\n')
}

const createSrcSetFixed = (apiUrl, source, args) => {
    let width = 0;
    let height = 0;
    if (args.width) {
        width = args.width;
    }
    if (args.height) {
        height = args.height
    }
    let array = [
        apiUrl + '/image/' + width + 'x' + height + '/' + source.id + '.' + source.extension + ' 1x'
    ];
    if (width * 1.5 <= source.width && height * 1.5 <= source.height) {
        array.push(apiUrl + '/image/' + width * 1.5 + 'x' + height * 1.5 + '/' + source.id + '.' + source.extension + ' 1.5x');
        if (width * 2 <= source.width && height * 2 <= source.height) {
            array.push(apiUrl + '/image/' + width * 2 + 'x' + height * 2 + '/' + source.id + '.' + source.extension + ' 2x');
        }
    }

    return array.join(',\n')
}

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
                            if (typeof (prop.dataUrl) === 'undefined') {
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
                        if (!nodes[0]) {
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
