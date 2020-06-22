<a href="https://flotiq.com/">
    <img src="https://editor.flotiq.com/fonts/fq-logo.svg" alt="Flotiq logo" title="Flotiq" align="right" height="60" />
</a>

gatsby-source-flotiq
====================

![](https://img.shields.io/npm/v/gatsby-source-flotiq)

Source plugin for pulling data from [Flotiq](http://flotiq.com) into [Gatsby](https://www.gatsbyjs.org/) websites.

Get up and running in minutes with a starter project:
* [Simple blog with Gatsby](https://github.com/flotiq/gatsby-starter-blog)
* [Projects portfolio](https://github.com/flotiq/gatsby-starter-projects)
* [Events calendar](https://github.com/flotiq/gatsby-starter-event-calendar)
* [Products showcase](https://github.com/flotiq/gatsby-starter-products)
* [Products with categories showcase](https://github.com/flotiq/gatsby-starter-products-with-categories)
* [Blog with Gatsby](https://github.com/flotiq/flotiq-blog)

## Table of contents

- [Install](#install)
- [Parameters](#parameters)
- [Collaboration](#collaboration)


## Install

Add Gatsby Source Flotiq plugin to your project:
```bash
npm install --save gatsby-source-flotiq
```

Enable and configure plugin:
```js
// in your gatsby-config.js in root of the project
require('dotenv').config();

module.exports = {
  // ...
  plugins: [
    {
      resolve: "gatsby-source-flotiq",		  
        options: {
            baseUrl: process.env.GATSBY_FLOTIQ_BASE_URL,
            authToken: process.env.GATSBY_FLOTIQ_API_KEY,
            forceReload: false, //(optional)
            includeTypes: ['contettype1', 'contettype2', ... ], //(optional) List of used contenttypes identified by API Name. If ommitted, all content types will be synchronized. Make sure to include all referenced content types as well
            objectLimit: 100000, //optional, limit number of objects for every type
            timeout: 5000, //optional
            resolveMissingRelations: true //optional, if the limit of objects is small some of the objects in relations could not be obtained from server, it this option is true they will be obtained as the graphQL queries in project would be resolved, if false, the missing object would resolve to null
        },
    },
  ],
  // ...
}
```

### Parameters

* `baseUrl` - url to the Flotiq API (in most cases `https://api.flotiq.com`)
* `authToke` - API token, if you wish to only pull data from Flotiq it can be Red-only key, if you need to put data it has to be Read-write key, more about Flotiq API keys [here](https://flotiq.com/docs/API/)
* `forceRelaod` - indicates if the data should be pulled in full or plugin should use cache (`true` for full pull, `false` for cache usage)
* `includeTypes` - array of Content Type Definitions used in the project (if you use images or files pulled from Flotiq, you must include `_media` CTD)
* `objectsLimit` - if you wish to not pull all objects from Flotiq (e.g. in development to speed up reload), you can limit it using this parameter, in production it should be higher than number of object in any Content Type pulled to project
* `timeout` - time (in milliseconds) after which connection to Flotiq should timed out
* `resolveMissingRelations` - when the `objectsLimit` is smaller than number of objects in CTDs to avoid nulls on objects connected to other objects plugin make additional calls to pull missing data, if you want to suppress this behavior set this parameter to `false` 


please make sure to put your API credentials in your `.env` file:

```
GATSBY_FLOTIQ_BASE_URL="https://api.flotiq.com"
GATSBY_FLOTIQ_API_KEY=XXXX-YOUR-API-KEY-XXXX
```

At this point you should have added Content Type Definitions required by your project/starter, more about adding Content Types ond Objects in [the Flotiq documentation](https://flotiq.com/docs/API/content-types/).

## Collaboration

If you wish to talk with us about this project, feel free to hop on [![Discord Chat](https://img.shields.io/discord/682699728454025410.svg)](https://discord.gg/FwXcHnX).
   
If you found a bug, please report it in [issues](https://github.com/flotiq/gatsby-source-flotiq/issues).
