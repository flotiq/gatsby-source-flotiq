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
npm install --save gatsby-source-flotiq gatsby-plugin-image gatsby-plugin-sharp gatsby-transformer-sharp
```

Enable and configure plugin:
```js
// in your gatsby-config.js in root of the project
require('dotenv').config();

module.exports = {
  // ...
  plugins: [
    {
      resolve: 'gatsby-source-flotiq',		  
        options: {
            baseUrl: process.env.GATSBY_FLOTIQ_BASE_URL,
            authToken: process.env.GATSBY_FLOTIQ_API_KEY,
            forceReload: false, //(optional)
            includeTypes: ['contettype1', 'contettype2', ... ], //(optional) List of used contenttypes identified by API Name. If ommitted, all content types will be synchronized. Make sure to include all referenced content types as well
            objectLimit: 100000, //optional, limit total number of objects downloaded for every type
            singleFetchLimit: 1000, //optional, limit the number of objects downloaded in single api call. Min: 1, Max 5000, Default 1000
            maxConcurrentDataDownloads: 10, //optional, limit the number of concurrent api calls. Default: 10, Min: 1, Max: 50
            timeout: 5000, //optional
            resolveMissingRelations: true, //optional, if the limit of objects is small some of the objects in relations could not be obtained from server, it this option is true they will be obtained as the graphQL queries in project would be resolved, if false, the missing object would resolve to null
            downloadMediaFile: false //optional, should media files be cached and be available for gatsby-image and gatsby-sharp
        },
    },
    'gatsby-plugin-image',
    'gatsby-plugin-sharp',
    'gatsby-transformer-sharp'
  ],
  // ...
}
```

### Parameters

* `baseUrl` - url to the Flotiq API (in most cases `https://api.flotiq.com`)
* `authToke` - API token, if you wish to only pull data from Flotiq it can be Red-only key, if you need to put data it has to be Read-write key, more about Flotiq API keys [here](https://flotiq.com/docs/API/)
* `forceRelaod` - indicates if the data should be pulled in full or plugin should use cache (`true` for full pull, `false` for cache usage)
* `includeTypes` - array of Content Type Definitions used in the project (if you use images or files pulled from Flotiq, you must include `_media` CTD)
* `objectsLimit` - if you wish to not pull all objects from Flotiq (e.g. in development to speed up reload), you can limit it using this parameter. This will limit the total number of downloaded objects. In production it should be higher than number of object in any Content Type pulled to project
* `singleFetchLimit` - if you experience timeuts, or any other problems with download, you can change the default number of objects downloaded in a single API call. It has to be in integer from `1` to `5000`. The default value is `1000`.
* `maxConcurrentDataDownloads` - If you have a large number of content types, or many objects in a single content type, you can change the default number of concurrent connections. It has to be in integer from `1` to `50`. The default value is `10`.
* `timeout` - time (in milliseconds) after which connection to Flotiq should timed out
* `resolveMissingRelations` - when the `objectsLimit` is smaller than number of objects in CTDs to avoid nulls on objects connected to other objects plugin make additional calls to pull missing data, if you want to suppress this behavior set this parameter to `false` 
* `downloadMediaFile` - should media files be downloaded and cached and be available fully for gatsby-image and gatsby-image-sharp

please make sure to put your API credentials in your `.env` file:

```
GATSBY_FLOTIQ_BASE_URL="https://api.flotiq.com"
GATSBY_FLOTIQ_API_KEY=XXXX-YOUR-API-KEY-XXXX
```

At this point you should have added Content Type Definitions required by your project/starter, more about adding Content Types ond Objects in [the Flotiq documentation](https://flotiq.com/docs/API/content-types/).

## Media

If you are using default `downloadMediaFile` parameter (`false`), the fixed and fluid images are limited (no base46, automatic webp translation and tracedSVG). You can use them like that (assuming you have blogpost Content Type with headerImage media property):

```
query MyQuery {
  allBlogpost {
    nodes {
      headerImage {
        gatsbyImageData(height: 1000, width: 1000)
        extension
        url
      }
    }
  }
}
```

```
import { GatsbyImage, getImage } from "gatsby-plugin-image"
//...
const post = this.props.data.blogpost;
const image = getImage(post.headerImage[0])
//...
{post.headerImage[0].extension !== 'svg' ?
    (<GatsbyImage image={image} alt="post image" />) :
    (<img src={`https://api.flotiq.com${post.headerImage[0].url}`} alt="post image" />)
}
```
You need a fallback for svg images because gatsby-plugin-image do not display them correctly.

If you are using `downloadMediaFile` as `true`, you can use full potential of gatsby-plugin-image and gatsby-image-sharp. You can use them like that (assuming you have blogpost Content Type with headerImage media property):
```
query MyQuery {
  allBlogpost {
    nodes {
      headerImage {
        localFile {
          extension
          childImageSharp {
            gatsbyImageData
          }
        }
      }
    }
  }
}
```

```
import { GatsbyImage, getImage } from "gatsby-plugin-image"
//...
const post = this.props.data.blogpost;
//...
{post.headerImage[0].extension !== 'svg' ?
    (<GatsbyImage image={image} alt="post image />)
    : (<img src={`https://api.flotiq.com${post.headerImage[0].url}`} alt="post image")
}
```

You need a fallback for svg images because gatsby-plugin-image do not display them correctly.

You can learn more about [Gatsby Image plugin here](https://www.gatsbyjs.com/docs/reference/built-in-components/gatsby-plugin-image/).

## Collaboration

If you wish to talk with us about this project, feel free to hop on [![Discord Chat](https://img.shields.io/discord/682699728454025410.svg)](https://discord.gg/FwXcHnX).
   
If you found a bug, please report it in [issues](https://github.com/flotiq/gatsby-source-flotiq/issues).
