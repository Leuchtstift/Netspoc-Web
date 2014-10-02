StartTest(function(t) {
    t.diag("Sanity test, loading classes on demand and verifying they were indeed loaded.")
    
    t.ok(Ext, 'ExtJS is here');

    t.requireOk('Ext.ux.DataTip');
    t.requireOk('Ext.ux.grid.Printer');
    t.requireOk('PolicyWeb.proxy.Custom');
    t.requireOk('PolicyWeb.store.Service');
    t.requireOk('PolicyWeb.store.Networks');
    t.requireOk('PolicyWeb.store.NetworkResources');
    t.requireOk('PolicyWeb.store.Rules');
    t.requireOk('PolicyWeb.store.Users');
    t.requireOk('PolicyWeb.store.Emails');
    t.requireOk('PolicyWeb.store.Netspoc');
    t.requireOk('PolicyWeb.store.NetspocState');
    t.requireOk('PolicyWeb.store.History');
    t.requireOk('PolicyWeb.store.Owner');
    t.requireOk('PolicyWeb.store.AllOwners');
    t.requireOk('PolicyWeb.store.AllServices');
    t.requireOk('PolicyWeb.store.CurrentPolicy');
    t.requireOk('PolicyWeb.store.DiffSetMail');
    t.requireOk('PolicyWeb.store.DiffGetMail');
    t.requireOk('PolicyWeb.store.DiffTree');
    t.requireOk('PolicyWeb.store.Supervisors');
    t.requireOk('PolicyWeb.store.Watchers');
    t.requireOk('PolicyWeb.view.Network');
    t.requireOk('PolicyWeb.view.Service');
    t.requireOk('PolicyWeb.view.Viewport');
    t.requireOk('PolicyWeb.view.Account');
    t.requireOk('PolicyWeb.view.button.ChooseService');
    t.requireOk('PolicyWeb.view.button.PrintButton');
    t.requireOk('PolicyWeb.view.button.PrintAllButton');
    t.requireOk('PolicyWeb.view.combo.OwnerCombo');
    t.requireOk('PolicyWeb.view.combo.HistoryCombo');
    t.requireOk('PolicyWeb.view.panel.grid.AllServices');
    t.requireOk('PolicyWeb.view.panel.grid.Emails');
    t.requireOk('PolicyWeb.view.panel.grid.NetworkResources');
    t.requireOk('PolicyWeb.view.panel.grid.Networks');
    t.requireOk('PolicyWeb.view.panel.grid.Rules');
    t.requireOk('PolicyWeb.view.panel.grid.Services');
    t.requireOk('PolicyWeb.view.panel.grid.Supervisors');
    t.requireOk('PolicyWeb.view.panel.grid.Users');
    t.requireOk('PolicyWeb.view.panel.grid.Watchers');
    t.requireOk('PolicyWeb.view.panel.card.PrintActive');
    t.requireOk('PolicyWeb.view.panel.form.ServiceDetails');
    t.requireOk('PolicyWeb.view.tree.Diff');
    t.requireOk('PolicyWeb.view.window.ExpandedServices');
    t.requireOk('PolicyWeb.view.window.Search');

})    