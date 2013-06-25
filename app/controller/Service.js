var search_window;
var print_window;
var cb_params_key2val = {
    display_property : {
        true  : 'name',
        false : 'ip'
    },
    expand_users : {
        true  : 1,
        false : 0
    }
};

Ext.define(
    'PolicyWeb.controller.Service', {
        extend : 'Ext.app.Controller',
        views  : [ 'panel.form.ServiceDetails' ],
        models : [ 'Service' ],
        stores : [ 'Service', 'AllServices', 'Rules', 'Users' ],
        refs   : [
            {
                selector : 'servicelist',
                ref      : 'servicesGrid'
            },
            {
                selector : 'servicedetails',
                ref      : 'serviceDetailsForm'
            },
            {
                selector : 'servicedetails > fieldcontainer > button',
                ref      : 'ownerTrigger'
            },
            {
                selector : 'servicedetails > fieldcontainer > textfield',
                ref      : 'ownerTextfield'
            },
            {
                selector : 'servicedetails > fieldcontainer',
                ref      : 'ownerField'
            },
            {
                selector : '#ownerEmails',
                ref      : 'ownerEmails'
            },
            {
                selector : '#userEmails',
                ref      : 'userDetailEmails'
            },
            {
                selector : 'serviceusers',
                ref      : 'serviceUsersView'
            },
            {
                selector : 'serviceview',
                ref      : 'serviceView'
            },
            {
                selector : 'serviceview cardprintactive',
                ref      : 'detailsAndUserView'
            },
            {
                selector : 'searchwindow > form',
                ref      : 'searchFormPanel'
            },
            {
                selector : 'chooseservice[relation="user"]',
                ref      : 'userServiceButton'
            },
            {
                selector : 'searchwindow > form button',
                ref      : 'startSearchButton'
            }
        ],

        init : function() {
            this.control(
                {
                    'serviceview > servicelist' : {
                        select : this.onServiceSelected
                    },
                    'serviceusers' : {
                        select : this.onUserDetailsSelected
                    },
                    'servicedetails button' : {
                        click  : this.onTriggerClick
                    },
                    'serviceview checkbox' : {
                        change  : this.onCheckboxChange
                    },
                    'serviceview > grid chooseservice' : {
                        click  : this.onButtonClick
                    },
                    'serviceview > grid button[text="Suche"]' : {
                        click  : this.displaySearchWindow
                    },
                    'print-all-button' : {
                        click  : this.onPrintAllButtonClick
                    },
                    'expandedservices' : {
                        beforeshow : this.onShowAllServices
                    },
                    'searchwindow > form button' : {
                        click  : this.onStartSearchButtonClick
                    },
                    'searchwindow > form textfield' : { 
                        specialkey  : this.onSearchWindowSpecialKey
                    },
                    'serviceview cardprintactive button[toggleGroup=polDVGrp]' : {
                        click  : this.onServiceDetailsButtonClick
                    }                    
                }
            );
            // Listen for application-wide events.
            this.application.on(
                {
                    some_event : this.doSth,
                    scope      : this
                }
            );

        },

        onLaunch : function () {

            var store = this.getServiceStore();
            store.on( 'load',
                      function () {
                          this.getServicesGrid().select0();
                      },
                      this
                    );
            appstate.addListener(
                'changed', 
                function () {
                    var button = this.getUserServiceButton();
                    button.toggle( true );
                    store.getProxy().extraParams.relation = button.relation;
                    store.load();
                },
                this
            );

            var userstore = this.getUsersStore();
            userstore.on( 'load',
                      function () {
                          this.getServiceUsersView().select0();
                      },
                      this
                    );

        },
        
        onServiceSelected : function( rowmodel, service, index, eOpts ) {
            // Load details, rules and emails of owners
            // for selected service.
            if (! service) {
                this.clearDetails();
                return;
            }

            if ( Ext.isObject( print_window )) {
                print_window.hide();
            }

            // Merge delegated owner and (multiple) std. owners.
            var sub_owner = service.get( 'sub_owner' );
            var array = service.get( 'owner' );
            var all_owners;
            if (sub_owner) {
                sub_owner.sub_owner = true;
                all_owners = [];
                all_owners = all_owners.concat(sub_owner, array);
            }
            else {
                all_owners = array;
            }
            service.set('all_owners', all_owners);

            // Load details form with values from selected record.
            var form = this.getServiceDetailsForm();
            form.loadRecord( service );

            // Handle multiple owners.
            var trigger = this.getOwnerTrigger();
            if (all_owners.length == 1) {
                // Hide trigger button if only one owner available.
                trigger.hide();
            }
            else {
                // Multiple owners available.
                trigger.show();
            }
            trigger.ownerCt.doLayout();
            // Show emails for first owner. Sets "owner1"-property
            // displayed as owner, too.
            this.onTriggerClick(); // manually call event handler

            // Load rules.
            var name  = service.get( 'name' );
            var store = this.getRulesStore();
            store.getProxy().extraParams.service = name;
            var params = this.getCheckboxParams();
            store.load( { params : params } );

            // Load users.
            store = this.getUsersStore();
            store.getProxy().extraParams.service = name;
            store.load();
        },
        
        onTriggerClick : function() {
            var owner_field = this.getOwnerField();
            var owner_text  = this.getOwnerTextfield();
            var formpanel   = this.getServiceDetailsForm();
            var form   = formpanel.getForm();
            var record = form.getRecord();
            var array  = record.get( 'all_owners' );
            var owner1 = array.shift();
            var name   = owner1.name;
            var alias  = owner1.alias || name;
            array.push(owner1);
            owner_field.setFieldLabel(
                owner1.sub_owner ? 'Verwalter:' : 'Verantwortung:');
            owner_text.setValue( alias );
            var emails = this.getOwnerEmails();
            emails.show( name, alias );
        },

        clearDetails : function() {
            var formpanel = this.getServiceDetailsForm();
            var form      = formpanel.getForm();
            var trigger   = this.getOwnerTrigger();
            form.reset();
            trigger.hide();
            trigger.ownerCt.doLayout();
            this.getRulesStore().removeAll();
            this.getUsersStore().removeAll();
            this.getOwnerEmails().clear();
            this.getUserDetailEmails().clear();
        },

        onPrintAllButtonClick : function( button, event, eOpts ) {
            if ( !Ext.isObject(print_window) ) {
                print_window = Ext.create(
                    'PolicyWeb.view.window.ExpandedServices'
                );
            }
            print_window.show();
        },
        
        onShowAllServices : function( win ) {
            var services  = '';
            var srv_store = this.getServiceStore();
            var concat_services = function ( rec ) {
                var srv_name = rec.get( 'name' );
                if ( srv_name ) {
                    services = services + srv_name + ',';
                }
                else {
                    return;
                }
            };
            var records = srv_store.each( concat_services );
            // Get rid of trailing comma
            services = services.slice(0, -1);
            
            // Without services it does not make 
            // sense to continue ...
            if ( services === '' ) {
                return;
            }
            
            var grid = win.down( 'grid' );
            var params = this.getCheckboxParams();
            params.services = services;
            grid.getStore().load(
                {
                    params : params
                }
            );
        },

        onButtonClick : function( button, event, eOpts ) {
            var relation = button.relation || '';
            var store    = this.getServiceStore();
            var proxy    = store.getProxy();
            var grid     = this.getServicesGrid();
            // Don't reload store if button clicked on is the one
            // that was already selected.
            if ( button.pressed && relation &&
                 relation === proxy.extraParams.relation ) {
                return;
            }
            proxy.extraParams.relation = relation;
            store.load();
        },

        onStartSearchButtonClick : function( button, event, eOpts ) {
            var form = this.getSearchFormPanel().getForm();
            if ( form.isValid() ) {
                button.search_params = form.getValues();
                var store      = this.getServiceStore();
                var relation   = button.relation;
                var params     = button.search_params;
                var keep_front = false;
            
                if ( params ) {
                    keep_front = params.keep_front;
                }
                if ( search_window && !keep_front ) {
                    search_window.hide();
                }
                if ( relation && relation === store.baseParams.relation) {
                    return;
                }
                store.load(
                    {
                        params   : params,
                        relation : relation
                    }
                );
                this.clearDetails();
            } else {
                var m = 'Bitte Eingaben in rot markierten ' +
                    'Feldern korrigieren.';
                Ext.MessageBox.alert( 'Fehlerhafte Eingabe!', m );
            }
        },
        
        onServiceDetailsButtonClick : function( button, event, eOpts ) {
            var card  = this.getDetailsAndUserView();
            var index = button.ownerCt.items.indexOf(button);
            if ( index === 2 ) {
                index = index - 1;
            }
            else {
                this.onTriggerClick();
            }
            card.layout.setActiveItem( index );
        },

        onUserDetailsSelected : function( rowmodel, user_item ) {
            var owner = '';
            var owner_alias = '';
            var email_panel = this.getUserDetailEmails();
            if ( user_item ) {
                owner       = user_item.get('owner');
                owner_alias = user_item.get('owner_alias');
            }
            // Email-Panel gets cleared on empty owner.
            email_panel.show( owner, owner_alias );
        },

        onSearchWindowSpecialKey : function( field, e ) {
            // Handle ENTER key press in search textfield.
            if ( e.getKey() == e.ENTER ) {
                var sb = this.getStartSearchButton();
                sb.fireEvent( 'click' );
            }
        },
        
        getCheckboxParams : function( checkbox, newVal ) {
            var params     = {};
            var view       = this.getServiceView();
            var checkboxes = view.query('checkbox');

            Ext.each(
                checkboxes, 
                function(cb) {
                    var name = cb.getName();
                    var value;
                    if ( !checkbox ) {
                        value = cb.getValue();
                    }
                    else {
                        if ( name === checkbox.getName() ) {
                            value = newVal;
                        }
                        else {
                            value = cb.getValue();
                        }
                    }
                    params[name] = cb_params_key2val[name][value];
                }
            );
            return params;
        },

        onCheckboxChange : function( checkbox, newVal, oldVal, eOpts ) {
            var params = this.getCheckboxParams( checkbox, newVal );
            var rules  = this.getRulesStore();
            rules.load( { params : params } );
            if ( Ext.isObject( print_window ) ) {
                this.onShowAllServices( print_window );
            }
        },
        
        displaySearchWindow : function() {
            if ( !search_window ) {
                search_window = Ext.create(
                    'PolicyWeb.view.window.Search'
                );
                search_window.on( 'show', function () {
                                      search_window.center();
                                      var t = search_window.query('textfield');
                                      t[0].focus( true, 20 );
                                  }
                                );
            }
            search_window.show();
        },

        doSth : function( button, event, eOpts ) {
        }
    }
);