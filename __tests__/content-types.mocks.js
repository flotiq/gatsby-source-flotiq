module.exports.CTD1 = {
    "id": "Type-1",
    "name": "Type-1",
    "label": "Type-1",
    "internal": false,
    "schemaDefinition": {
      "type": "object",
      "allOf": [
        {"$ref": "#/components/schemas/AbstractContentTypeSchemaDefinition"},
        {
          "type": "object",
          "properties": {
            "data": {
              "type": "string",
              "minLength": 1
            },
            "name": {
              "type": "string",
              "minLength": 1
            }
          }
        }
      ],
      "required": [
        "name",
        "data"
      ],
      "additionalProperties": false
    },
    "metaDefinition": {
      "order": [
        "name",
        "data"
      ],
      "propertiesConfig": {
        "data": {
          "label": "Data",
          "unique": true,
          "helpText": "",
          "inputType": "text"
        },
        "name": {
          "label": "Name",
          "unique": false,
          "helpText": "",
          "inputType": "text"
        }
      }
    },
    "deletedAt": null,
    "createdAt": "2020-02-20T09:25:54.000000+0000",
    "updatedAt": null
  }

module.exports.CTD1_STR = JSON.stringify(module.exports.CTD1);

module.exports.CTD1_OBJECT1_DATA = {
    name: "Object 1 name",
    data: "Object 1 data",
}

module.exports.CTD1_OBJECT1 = {
    id: "CTD1-Object-1",
    ...module.exports.CTD1_OBJECT1_DATA,
    internal: {
        "deletedAt": null,
        "createdAt": "2020-02-20T09:25:54.000000+0000",
        "updatedAt": null
    }
}

module.exports.CTD1_OBJECT1_STR = JSON.stringify(module.exports.CTD1_OBJECT1)