
Ext.define(
    'PolicyWeb.model.Supervisor',
    {
        extend : 'PolicyWeb.model.Base',

        proxy : {
            url : 'backend/get_supervisors'
        }
    }
);

