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
* [Blog with Gatsby](https://github.com/flotiq/flotiq-blog)

## Table of contents

- [Install](#install)


## Install

```bash
npm install --save https://github.com/flotiq/gatsby-source-flotiq
```

```js
// in your gatsby-config.js
module.exports = {
  // ...
  plugins: [
    {
      resolve: "gatsby-source-flotiq",		  
        options: {
            baseUrl: process.env.GATSBY_FLOTIQ_BASE_URL,
            authToken: process.env.FLOTIQ_API_KEY,
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

At this point you should have added Content Type Definitions required by template you chosen.
