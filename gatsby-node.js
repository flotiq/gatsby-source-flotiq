const fetch = require('node-fetch');
const {createContentDigest} = require(`gatsby-core-utils`);
const {getGatsbyImageResolver} = require("gatsby-plugin-image/graphql-utils");
const {generateImageData, getLowResolutionImageURL} = require("gatsby-plugin-image");
const {getContentTypes, getDeletedObjects, getContentObjects} = require('./src/data-loader');
const {capitalize, createHeaders} = require('./src/utils')
const CTD_MEDIA = '_media';
const digest = str => createContentDigest(str);

let apiUrl;

let typeDefinitionsDeferred;
let typeDefinitionsPromise = new Promise((resolve, reject) => {
    typeDefinitionsDeferred = {resolve: resolve, reject: reject};
});

let createNodeGlobal;
let resolveMissingRelationsGlobal;
let downloadMediaFileGlobal = false;
let headers = {};
let globalSchema = {};
let contentTypeDefsData = [];

exports.onPluginInit = async ({actions, schema, reporter}, options) => {
    const {createNode} = actions;
    const {
        baseUrl = "https://api.flotiq.com",
        authToken,
        includeTypes = null,
        resolveMissingRelations = true,
        downloadMediaFile = false
    } = options;
    headers = createHeaders(options);

    createNodeGlobal = createNode;
    resolveMissingRelationsGlobal = resolveMissingRelations;
    downloadMediaFileGlobal = downloadMediaFile;
    apiUrl = baseUrl;
    globalSchema = schema;
    if (authToken) {
        contentTypeDefsData = await getContentTypes(reporter, options, apiUrl);
    }

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
}

exports.sourceNodes = async (gatsbyFunctions, options) => {

    const {actions, store, getNodes, reporter, schema} = gatsbyFunctions;
    const {createNode, setPluginStatus, touchNode, deleteNode} = actions;
    const {forceReload} = options;

    try {
        if (forceReload) {
            setPluginStatus({'updated_at': null});
        }
        let lastUpdate = store.getState().status.plugins['gatsby-source-flotiq'];

        const existingNodes = getNodes().filter(
            n => n.internal.owner === `gatsby-source-flotiq`
        );
        existingNodes.forEach(n => touchNode(n));
        if (!existingNodes.length) {
            lastUpdate = undefined;
        }

        let changed = 0;
        let removed = 0;

        if (lastUpdate && lastUpdate.updated_at) {
            removed = await getDeletedObjects(gatsbyFunctions, options, lastUpdate.updated_at, contentTypeDefsData, apiUrl, async (ctd, id) => {
                let node = existingNodes.find(n => n.id === `${ctd.name}_${id}`);
                return await deleteNode(node);
            });
        }

        changed = await getContentObjects(gatsbyFunctions, options, lastUpdate && lastUpdate.updated_at, contentTypeDefsData, apiUrl, async (ctd, datum) => {
            return createNode({
                ...datum,
                // custom
                flotiqInternal: datum.internal,
                // required
                id: ctd.name === CTD_MEDIA ? datum.id : `${ctd.name}_${datum.id}`,
                parent: null,
                children: [],
                internal: {
                    type: capitalize(ctd.name),
                    contentDigest: digest(JSON.stringify(datum)),
                },
            });
        })

        if (changed) {
            reporter.info(`Updated entries ${changed}`);
        }
        if (removed) {
            reporter.info(`Removed entries ${removed}`);
        }
        setPluginStatus({
            'updated_at':
                (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        });
    } catch (e) {
        reporter.panic(`FLOTIQ: ${e.message}`)
    }

    return {};
};

exports.createSchemaCustomization = ({actions}, options) => {
    const {createTypes} = actions;
    createTypeDefs(contentTypeDefsData, globalSchema, options.includeTypes);

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
        type FlotiqBlock {
            time: String
            version: String
            blocks: [FlotiqBlock2]
        }
        type FlotiqBlock2 {
            id: String
            type: String
            data: FlotiqBlockData
            tunes: FlotiqBlockTunes
        }
        type FlotiqBlockData {
            text: String
            level: Float
            anchor: String
            items: [FlotiqBlockItems]
            style: String
            url: String
            width: String
            height: String
            fileName: String
            extension: String
            caption: String
            stretched: String
            withBorder: String
            withBackground: String
            message: String
            title: String
            alignment: String
            code: String
            withHeadings: Boolean
            content: [[String]]
        }
        type FlotiqBlockTunes {
            alignmentTuneTool: FlotiqBlockAlignementTune
        }
        type FlotiqBlockAlignementTune {
            alignment: String
        }
        type FlotiqBlockItems {
            items: [FlotiqBlockItems]
            content: String
        }
        type FlotiqImageFixed implements Node {
            aspectRatio: Float
            width: Float
            height: Float
            src: String
            srcSet: String
            originalName: String
        }
        type FlotiqImageFluid implements Node {
            aspectRatio: Float
            src: String
            srcSet: String
            originalName: String
            sizes: String
        }
        type DataSource {
            dataUrl: String!
            type: String!
        }`
        );
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
                            ext: `.${source.extension}`
                        });
                    }
                }
            }
        })
    } else {
        createResolvers({
            _media: {
                gatsbyImageData: getGatsbyImageResolver(resolveGatsbyImageData),
            },
        })
    }
}


const createAditionalDef = (
    name,
    property,
    properties,
    includeTypes,
    schema,
    processedDefs=[],
) => {
    const defName = capitalize(property) + capitalize(name);
    let typeDefs=[];

    let additionalDef = {
        name: defName,
        fields: {},
        interfaces: ["Node"],
    };
    Object.keys(properties[property].items.propertiesConfig).forEach(prop => {
        let propConfig = properties[property].items.propertiesConfig[prop];

        if (propConfig.inputType === 'object' && !processedDefs.includes(defName)) {
            typeDefs.push(...createAditionalDef(
                name,
                prop,
                properties[property].items.propertiesConfig,
                includeTypes,
                schema,
                processedDefs
            ));
        }
        additionalDef.fields[prop] = getType(
            propConfig,
            false,
            prop,
            capitalize(name),
            includeTypes
        );
    });
    additionalDef.fields.flotiqInternal = `FlotiqInternal!`;

    if(!processedDefs.includes(defName)){
        typeDefs.push(schema.buildObjectType(additionalDef));
        processedDefs.push(defName)
    }

    return typeDefs;
}

const createTypeDefs = (contentTypesDefinitions, schema, includeTypes) => {
    let typeDefs = [];
    const names = contentTypesDefinitions.map(ctd => capitalize(ctd.name));
    typeDefs.push(`union AllTypes = ${names.join(' | ')}`);
    contentTypesDefinitions.forEach(ctd => {
        let tmpDef = {
            name: capitalize(ctd.name),
            fields: {},
            interfaces: ["Node"],
        };
        Object.keys(ctd.schemaDefinition.allOf[1].properties).forEach(property => {
            if(['if', 'else', 'then'].includes(property) || !ctd.metaDefinition.propertiesConfig[property]) {
                return;
            }
            tmpDef.fields[property] = getType(
                ctd.metaDefinition.propertiesConfig[property],
                ctd.schemaDefinition.required.indexOf(property) > -1,
                property,
                capitalize(ctd.name),
                includeTypes
            );
            if (ctd.metaDefinition.propertiesConfig[property].inputType === 'object') {
                let additionalDef = createAditionalDef(
                    ctd.name,
                    property,
                    ctd.metaDefinition.propertiesConfig,
                    includeTypes,
                    schema
                );

                typeDefs.push(...additionalDef);
            }
        });

        tmpDef.fields.flotiqInternal = `FlotiqInternal!`;
        typeDefs.push(schema.buildObjectType(tmpDef));
    });
    typeDefinitionsDeferred.resolve(typeDefs);
};


const getType = (propertyConfig, required, property, ctdName, includeTypes) => {

    switch (propertyConfig.inputType) {
        case 'text':
        case 'textarea':
        case 'richtext':
        case 'textMarkdown':
        case 'email':
        case 'radio':
        default:
            return 'String' + (required ? '!' : '');
        case 'select':
            return propertyConfig.multiple ? ['String' + (required ? '!' : '')] : 'String' + (required ? '!' : '');
        case 'number':
            return 'Float' + (required ? '!' : '');
        case 'checkbox':
            return 'Boolean' + (required ? '!' : '');
        case 'geo':
            return 'FlotiqGeo' + (required ? '!' : '');
        case 'simpleList':
            return ['String' + (required ? '!' : '')];
        case 'datasource':
            if (
                includeTypes
                && propertyConfig.validation.relationContenttype !== ''
                && includeTypes.indexOf(propertyConfig.validation.relationContenttype) === -1
                && propertyConfig.validation.relationContenttype !== CTD_MEDIA
            ) {
                return 'DataSource';
            }
            let type =
                propertyConfig.validation.relationContenttype
                    ? (propertyConfig.validation.relationContenttype !== CTD_MEDIA
                        ? capitalize(propertyConfig.validation.relationContenttype)
                        : CTD_MEDIA)
                    : 'AllTypes';
            return {
                type: `[${type}]`,
                resolve: async (source, args, context, info) => {
                    if (source[property]) {
                        let nodes = await Promise.all(source[property].map(async (prop) => {
                            if (typeof (prop.dataUrl) === 'undefined') {
                                return;
                            }
                            let node = {
                                id: prop.dataUrl.split('/')[4] === CTD_MEDIA
                                    ? prop.dataUrl.split('/')[5]
                                    : prop.dataUrl.split('/')[4] + '_' + prop.dataUrl.split('/')[5],
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
                                        id: prop.dataUrl.split('/')[4] === CTD_MEDIA
                                            ? json.id
                                            : `${prop.dataUrl.split('/')[4]}_${json.id}`,
                                        parent: null,
                                        children: [],
                                        internal: {
                                            type: capitalize(prop.dataUrl.split('/')[4]),
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
            return `[${capitalize(property)}${ctdName}]`;
        case 'block':
            return 'FlotiqBlock'
    }
};

const generateImageSource = (baseURL, width = 0, height = 0, format, fit, options) => {
    const src = `https://api.flotiq.com/image/${width || options.width}x${height || options.height}/${baseURL}.${format}`
    return {src, width, height, format}
}


const resolveGatsbyImageData = async (image, options) => {
    const filename = image.id
    const sourceMetadata = {
        width: image.width,
        height: image.height,
        format: image.extension
    }
    const imageDataArgs = {
        ...options,
        pluginName: `gatsby-source-flotiq`,
        sourceMetadata,
        filename,
        placeholderURL: '',
        generateImageSource,
        formats: [image.extension],
        options: {...options, extension: image.extension},
    }
    // if(options.placeholder === "blurred") {
    //     const lowResImage = getLowResolutionImageURL(imageDataArgs)
    //     imageDataArgs.placeholderURL =  await getBase64Image(lowResImage)
    // }
    return generateImageData(imageDataArgs)
}
