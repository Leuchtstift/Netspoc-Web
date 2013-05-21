

Ext.define(
    'PolicyWeb.store.Owner',
    {
        extend   : 'PolicyWeb.store.Netspoc',
        model    : 'PolicyWeb.model.Owner',
        autoLoad : true,
        sorter   : 'alias',
        proxy    : {
            type     : 'policyweb',
            proxyurl : 'get_owner'
        }
    }

);
