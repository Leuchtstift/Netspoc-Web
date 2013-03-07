
Ext.ns("NetspocManager");

/**
 * @class NetspocManager.DiffManager
 * @extends Ext.tree.TreePanel
 * NEEDS A DESCRIPTION
 * <br />
 * @constructor
 * @param {Object} config The config object
 * @xtype diffmanager
 **/

NetspocManager.DiffManager = Ext.extend(
    Ext.tree.TreePanel,
    {
        useArrows : true,
        autoScroll: true,
        animate   : false,
        containerScroll: true,
        border    : false,
        loader    : {
            dataUrl  : 'backend/get_diff',
            
            // Send  value of 'id' of root node as parameter 'version'.
            nodeParameter : 'version',

            translation : {
                'service_lists owner' : 'Liste eigener Dienste',
                'service_lists user'  : 'Liste genutzter Dienste',
                'objects'             : 'Objekte',
                'services'            : 'Dienste',
                'users'               : 'Liste der Benutzer (User)'
            },
            rename : function (child) {
                var txt = child.text;
                var out = this.translation[txt];
                if (out) {
                    child.setText(out);
                }
            },
            listeners: {
                beforeload: function(loader, node) {
                    var appstate = NetspocManager.appstate;
                    var active_owner = appstate.getOwner();
                    var history = appstate.getHistory();
                    if (node.id === 'none') {
                        return false;
                    }
                    loader.baseParams.active_owner = active_owner;
                    loader.baseParams.history = history;
                    node.setText('');
                },
                load : function(loader, node, response) {
                    node.eachChild(loader.rename, loader);
                    // Expand recursively
                    node.expandChildNodes(true);
                    node.setText((node.firstChild ? '' : 'keine ') +
                                 'Unterschiede');
                }
            } 
        },

        root: {
            text: 'Bitte Stand auswählen in "Vergleiche mit".',
            id: 'none'
        },

        initComponent : function() {
            var appstate = NetspocManager.appstate;
            var store = Ext.StoreMgr.get('historyStore');
            var combo = this.buildHistoryCombo(store);
            var checkbox = this.buildDiffMailCheckBox();
            this.combo = combo;
            this.tbar =  [ 'Vergleiche mit', 
                           combo,
                           ' ',
                           {
                               xtype   : 'button',
                               text    : 'Diff per Mail senden',
                               handleMouseEvents : false,
                               tooltip : 
                               'Vergleicht am Ende eines Tages' +
                                   ' den aktuellen Stand ' +
                                   ' mit dem Stand des Vortags' +
                                   ' und sendet Ihnen bei Änderungen eine Mail.'
                           },
                           checkbox
                         ],
            NetspocManager.DiffManager.
                superclass.initComponent.call(this);
            this.addListener('beforerender',
                             function() {
                                 this.loadDiffMailCheckBox(checkbox);
                             });
            appstate.addListener(
                'changed', 
                function () {
                    var node;
                    if (! this.rendered) {
                        return;
                    }
                    node = this.getRootNode();
                    // Only direct childs, no animation.
                    node.collapse(false, false);
                    node.setText('');
                    node.setId('none');
                    combo.setValue('');
                    this.loadDiffMailCheckBox(checkbox);
                }, this);                    
        },

        buildHistoryCombo : function (store) {
            return Ext.create(
                {
                    xtype     : 'historycombo',
                    store     : store,
                    lastQuery : '',
                    listeners : {
                        scope  : this,
                        
                        // Filter out records of store which are newer than 
                        // selected history value.
                        beforequery: function (qe) { 
                            var appstate = NetspocManager.appstate; 
                            var policy = appstate.getPolicy();
                            // Skip first character "p".
                            var pnum = policy.slice(1);
                            var filter = function(record, id) {
                                var pnum2 = record.get('policy').slice(1);
                                return (pnum2 < pnum);
                            }; 
                            var store = qe.combo.getStore();

                            // If store has never been loaded or
                            // records have been removed, then load store.
                            if (store.needLoad) {
                                delete qe.combo.lastQuery;
                                store.needLoad = false;
                                store.on('load', 
                                         function () {
                                             store.filterBy(filter);
                                         },
                                         this,
                                         { single : true });
                            }
                            else {
                                store.filterBy(filter);
                            }
                        },
                        // Set selected version to 'id' of root. 
                        // Will be used as parameter 'version' during load.
                        // Load tree of differences.
                        select : function (combo, record, index) {
                            var version = record.get('date');
                            var node = this.getRootNode();
                            combo.setValue(version);
                            node.setId(version);
                            if ( node.isLoaded() ) {
                                node.reload();
                            }
                            else {
                                node.expand();
                            }
                        }
                    }
                }
            );
        },
        buildDiffMailCheckBox : function () {
            var checkbox = Ext.create( { xtype : 'checkbox' } );
            checkbox.on('check', function (checkbox, checked) {
                // Don't handle initial event from setValue above.
                if (! checkbox.send_event ) {
                    return;
                }
                var store = new NetspocWeb.store.NetspocState(
                    {
                        proxyurl : 'set_diff_mail',
                        fields     : [],
                        autoDestroy: true
                    }
                );
                store.load({ params : { send : checked } });
            });
            return checkbox;
        },
        loadDiffMailCheckBox : function (checkbox) {
            var store = new NetspocWeb.store.NetspocState(
                {
                    proxyurl : 'get_diff_mail',
                    fields     : [ 'send' ],
                    autoDestroy: true
                }
            );
            checkbox.send_event = false;
            store.load({ 
                scope    : this,
                callback : function(records, options, success) {
                    var result = records[0].get('send');
                    checkbox.setValue(result);
                    checkbox.send_event = true;
                }
            });
        }
    }
);

Ext.reg( 'diffmanager', NetspocManager.DiffManager );
