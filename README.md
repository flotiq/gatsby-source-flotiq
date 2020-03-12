# gatsby-source-flotiq

Source plugin for pulling data from [Flotiq](http://flotiq.com) into [Gatsby](https://www.gatsbyjs.org/) websites.

Get up and running in minutes with a starter project:
* [Simple blog with Gatsby](https://github.com/flotiq/gatsby-starter-blog)
* [Projects portfolio](https://github.com/flotiq/gatsby-starter-projects)
* [Events calendar](https://github.com/flotiq/gatsby-starter-event-calendar)
* [Products showcase](https://github.com/flotiq/gatsby-starter-products)
* [Blog with Gatsby](https://github.com/flotiq/flotiq-blog)

## Table of contents

- [Install](#install)
- [Options](#options)


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
      "resolve": "gatsby-source-flotiq",		  
        "options": {
            "baseUrl": process.env.GATSBY_FLOTIQ_BASE_URL,
            "authToken": process.env.FLOTIQ_API_KEY,
            "forceReload": false
        },
    },
  ],
  // ...
}
```

At this point you should have added Content Type Definitions required by template you chosen.

## Options
