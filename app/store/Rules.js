

Ext.define(
    'PolicyWeb.store.Rules',
    {
        extend   : 'PolicyWeb.store.NetspocState',
        model    : 'PolicyWeb.model.Rule',
        autoLoad : false,
/*
        sorters  : [
            {
            }
        ],
*/
        proxy       : {
            type     : 'policyweb',
            proxyurl : 'get_rules'
        }
    }
);
