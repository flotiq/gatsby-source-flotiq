const fetch = require('node-fetch');
const workers = require('./workers')
const {capitalize, createHeaders} = require('./utils')

module.exports.getContentTypes = async function (options) {
    const {
        timeout = 5000,
        includeTypes = null,
        baseUrl
    } = options;

    let contentTypeDefinitionsResponse = await fetch(
        baseUrl + '/api/v1/internal/contenttype?limit=10000&order_by=label',
        {
            headers: createHeaders(options),
            timeout: timeout
        });
    
    if (contentTypeDefinitionsResponse.ok) {
        let contentTypeDefinitions = await contentTypeDefinitionsResponse.json();
        const contentTypeDefsData = contentTypeDefinitions.data.filter(
            contentTypeDef => !includeTypes || includeTypes.indexOf(contentTypeDef.name) > -1);

        return contentTypeDefsData
    } else {
        if (contentTypeDefinitionsResponse.status === 404) {
            throw new Error(`We couldn't connect to API. Check if you specified correct API url (in most cases it is "https://api.flotiq.com")`)
        } else if (contentTypeDefinitionsResponse.status === 403) {
            throw new Error(`We couldn't authorize you in API. Check if you specified correct API token (if you don't know what it is check: https://flotiq.com/docs/API/)`)
        } else throw new Error(await contentTypeDefinitionsResponse.text())
        
    }
} 

module.exports.getDeletedObjects = async function (gatsbyFunctions, options, since, contentTypes, handleDeletedId) {
    let removed = 0;
    const { reporter } = gatsbyFunctions;
    const {
        baseUrl
    } = options;
    await Promise.all(contentTypes.map(async ctd => {
        
        let url = baseUrl + '/api/v1/content/' + ctd.name + '/removed?deletedAfter=' + encodeURIComponent(since);
        response = await fetch(url, {headers: createHeaders(options)});
        reporter.info(`Fetching removed content type ${ctd.name}: ${url}`);
        if (response.ok) {
            const jsonRemoved = await response.json();
            await Promise.all(jsonRemoved.map(async id => {
                removed++;
                return await handleDeletedId(ctd, id)
            }));
        }
        
    }));

    return removed;
}

module.exports.getContentObjects = async function (gatsbyFunctions, options, since, contentTypes, handleObject) {
    const { reporter, getNodesByType } = gatsbyFunctions;

    const {
        baseUrl,
        objectLimit = 100000,
        timeout = 5000
    } = options;
    
    let {
        singleFetchLimit = 1000,
        maxConcurrentDataDownloads = 10
    } = options;
    
    maxConcurrentDataDownloads = Math.max(Math.min(maxConcurrentDataDownloads, 50), 1)  // 1 <= maxConcurrentDataDownloads  <= 50
    singleFetchLimit = Math.max(Math.min(singleFetchLimit, 5000), 1);                   // 1 <= singleFetchLimit            <= 5000

    let changed = 0;
    let downloadJobs = contentTypes.map(ctd => {
        let currentNodeCount = 0;
        let limitPerPage = Math.min(singleFetchLimit, objectLimit);
        let url = baseUrl + '/api/v1/content/' + ctd.name + '?limit=' + limitPerPage + '';

        if (since) {
            currentNodeCount = getNodesByType(capitalize(ctd.name)).count;
            url += '&filters=' + encodeURIComponent(JSON.stringify({
                "internal.updatedAt": {
                    "type": "greaterThan",
                    "filter": since
                }
            }))
        }
        
        return {
            baseUrl: url,
            objectLimit: objectLimit - currentNodeCount,
            limitPerPage,
            page: 1,
            ctd
        }
    });

    const dataLoadCount = {}

    await workers(downloadJobs, maxConcurrentDataDownloads, async ({baseUrl, objectLimit, page, ctd, totalPages, limitPerPage}) => {
        const url = `${baseUrl}&page=${page}`;
        const humanizedPageNumber = page === 1 ? 'frist page' : `${page}/${totalPages}`
        reporter.info(`Fetching${since ? ' updates' : ''}: ${ctd.name} ${humanizedPageNumber}`)
        let response = await fetch(url, {headers: createHeaders(options), timeout: timeout});
        if (!response.ok) 
        {
            reporter.warn('Error fetching data', response);
            return;
        }

        const json = await response.json();
        totalPages = json.total_pages;
        dataLoadCount[ctd.name] = dataLoadCount[ctd.name] || 0; 
        await Promise.all(json.data.map(async datum => {
            changed++;
            dataLoadCount[ctd.name]++;
            return await handleObject(ctd, datum)
        }));

        // Now that we know the dataset size, we can try to queue the rest of the download
        if(page === 1 && json.total_pages > page) {
            let maxAllowedPages = Math.ceil(objectLimit/limitPerPage);
            let pageLimit = Math.min(json.total_pages, maxAllowedPages);
            for(let i = page + 1; i <= pageLimit; i++) {
              downloadJobs.push({
                baseUrl, objectLimit, page: i, ctd, totalPages: pageLimit
              }) 
            }
        }
    })

    return changed;
}