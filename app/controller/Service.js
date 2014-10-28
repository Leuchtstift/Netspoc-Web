/*
(C) 2014 by Daniel Brunkhorst <daniel.brunkhorst@web.de>
            Heinz Knutzen     <heinz.knutzen@gmail.com>

https://github.com/hknutzen/Netspoc-Web

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

var ip_search_tooltip;
var search_window;
var print_window;
var cb_params_key2val = {
    'display_property' : {
        'true'  : 'name',
        'false' : 'ip'
    },
    'expand_users' : {
        'true'  : 1,
        'false' : 0
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
                selector : 'mainview > panel',
                ref      : 'mainCardPanel'
            },
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
                selector : 'searchwindow > panel',
                ref      : 'searchCardPanel'   
            },
            {
                selector : 'searchwindow > form',
                ref      : 'searchFormPanel'
            },
            {
                selector : 'searchwindow > form > tabpanel',
                ref      : 'searchTabPanel'
            },
            {
                selector : 'chooseservice[pressed="true"]',
                ref      : 'chooseServiceButton'
            },
            {
                selector : 'serviceview > grid button[text="Suche"]',
                ref      : 'searchServiceButton'
            },
            {
                selector : 'searchwindow > form button[text="Suche starten"]',
                ref      : 'startSearchButton'
            },
            {
                selector : 'searchwindow > form checkboxgroup',
                ref      : 'searchCheckboxGroup'
            }
        ],

        init : function() {
            this.control(
                {
                    'serviceview' : {
                        //beforeactivate : this.onBeforeActivate
                    },
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
                        change : this.onCheckboxChange
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
                    'searchwindow > panel button[toggleGroup="navGrp"]': {
                        click  : this.onNavButtonClick
                    },
                    'searchwindow > form button[text="Suche starten"]' : {
                        click  : this.onStartSearchButtonClick
                    },
                    'searchwindow > form > tabpanel fieldset > textfield' : { 
                        specialkey  : this.onSearchWindowSpecialKey
                    },
                    'searchwindow > form > tabpanel' : { 
                        tabchange  : this.onSearchWindowTabchange
                    },
                    'serviceview cardprintactive button[toggleGroup=polDVGrp]' : {
                        click  : this.onServiceDetailsButtonClick
                    }                    
                }
            );
        },

        onLaunch : function () {

            var store = this.getServiceStore();
            store.on( 'load',
                      function () {
                          if ( store.getCount() === 0 ) {
                              this.clearDetails();
                          }
                          else {
                              this.getServicesGrid().select0();
                          }
                          //this.displaySearchWindow(); // for debug
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

/*        
	onBeforeActivate : function() {
            if ( appstate.getInitPhase() ) {
                // Prevent double loading on startup.
                return;
            }
            this.getServiceStore().load();
        },
*/


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
            var rules_store = this.getRulesStore();
            rules_store.getProxy().extraParams.service = name;
            var params = this.getCheckboxParams();
            var relation = this.getCurrentRelation();
            // The buttons "Eigene", "Genutzte" and "Nutzbare"
            // have a relation attribute. The only one without this
            // attribute is the search button and relation will
            // be undefined, so we merge in the search parameters.
            if ( typeof relation === 'undefined' ) {
                params = Ext.merge(
                    params,
                    this.getSearchParams()
                );
            }
            rules_store.load( { params : params } );

            // Load users.
            var user_store = this.getUsersStore();
            user_store.getProxy().extraParams.service = name;
            user_store.load( { params : params } );
        },
        
        onTriggerClick : function() {
            var owner_field = this.getOwnerField();
            var owner_text  = this.getOwnerTextfield();
            var formpanel   = this.getServiceDetailsForm();
            var form   = formpanel.getForm();
            var record = form.getRecord();
            if ( record ) {
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
            }
        },

        clearDetails : function() {
            var formpanel = this.getServiceDetailsForm();
            var form      = formpanel.getForm();
            var trigger   = this.getOwnerTrigger();
            form.reset( true );
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
        
        getSearchParams : function() {
            var search_params = {};
            var form;
            if ( Ext.isObject(search_window) ) {
                form = this.getSearchFormPanel().getForm();
                if ( form.isValid() ) {
                    search_params = form.getValues();
                    return this.removeNonActiveParams( search_params );
                }
            }
            return {};
        },

        onShowAllServices : function( win ) {
            var srv_store     = this.getServiceStore();
            var grid          = win.down( 'grid' );
            var extra_params  = srv_store.getProxy().extraParams;
            var cb_params     = this.getCheckboxParams();
            var params        = Ext.merge( cb_params, extra_params );
            params.relation   = this.getCurrentRelation();
            params = Ext.merge(
                params,
                this.getSearchParams()
            );
            grid.getStore().load( { params : params } );
        },

        getCurrentRelation : function() {
            var b = this.getCurrentlyPressedServiceButton();
            return b.relation;
        },

        getCurrentlyPressedServiceButton : function() {
            var sg = this.getServicesGrid();
            var tb = sg.getDockedItems('toolbar[dock="top"]');
            var b  = tb[0].query( 'button[pressed=true]' );
            return b[0];
        },

        onButtonClick : function( button, event, eOpts ) {
            var relation = button.relation;
            var store    = this.getServiceStore();
            var proxy    = store.getProxy();
            var sb       = this.getSearchServiceButton();
            sb.toggle( false );

            // Don't reload store if button clicked on is the one
            // that was already selected.
            if ( !button.pressed && relation &&
                 relation === proxy.extraParams.relation ) {
                     button.toggle( true );
                     return;
            }

            // Pressing "Eigene/Genutzte Dienste" should clear
            // search form. Otherwise when changing owner, a search
            // with leftover params will be performed, although
            // own or used services should be displayed.
            this.getSearchFormPanel().getForm().reset();
            
            proxy.extraParams.relation = relation;
            store.load();
        },

        onNavButtonClick : function( button, event, eOpts ) {
            var card  = this.getSearchCardPanel();
            var index = button.ownerCt.items.indexOf(button);
            card.layout.setActiveItem( index );
        },

        removeNonActiveParams : function( params ) {
            /*
             * Remove textfield params of non-active tabpanel
             * from search parameters.
             */
            var tab_panel  = this.getSearchTabPanel();
            var active_tab = tab_panel.getActiveTab();
            var index = tab_panel.items.indexOf( active_tab );
            if ( index === 0 ) {
                params.search_string = '';
            }
            else {
                params.search_ip1    = '';
                params.search_ip2    = '';
                params.search_proto  = '';
            }
            return params;
        },

        onStartSearchButtonClick : function( button, event, eOpts ) {
            var form = this.getSearchFormPanel().getForm();
            var sb = this.getSearchServiceButton();
            if ( form.isValid() ) {
                button.search_params = form.getValues();
                var store      = this.getServiceStore();
                var relation   = button.relation;
                var keep_front = false;
                var params     = this.removeNonActiveParams(
                    button.search_params);
            
                if ( params ) {
                    keep_front = params.keep_front;
                }
                if ( search_window && !keep_front ) {
                    search_window.hide();
                }
                params.relation = '';
                store.on(
                    'load',
                    function ( mystore, records ) {
                        if ( records.length === 0 ) {
                            var m = 'Ihre Suche ergab keine Treffer!';
                            Ext.MessageBox.alert( 'Keine Treffer für Ihre Suche!', m );
                        }

                        // Highlight "Suche"-button
                        var b = this.getCurrentlyPressedServiceButton();
                        b.toggle(false);
                        sb.toggle(true);
                    },
                    this,  // scope (defaults to the object which fired the event)
                    { single : true }   // deactivate after being run once 
                );
                store.load(
                    {
                        params   : params
                    }
                );
            } else {
                var m = 'Bitte Eingaben in rot markierten ' +
                    'Feldern korrigieren.';
                Ext.MessageBox.alert( 'Fehlerhafte Eingabe!', m );
            }
        },
        
        onServiceDetailsButtonClick : function( button, event, eOpts ) {
            // We have two buttons: "Details zum Dienst"
            // and "Benutzer (User) des Dienstes".
            // index: 0 = service details
            //        1 = vertical separator
            //        2 = service User
            var card  = this.getDetailsAndUserView();
            var index = button.ownerCt.items.indexOf(button);
            var active_idx = card.items.indexOf( card.layout.activeItem );
            if ( index === 2 ) {
                // This is necessary because the vertical separator
                // between the two buttons has an index, too.
                index = index - 1;
            }
            else {
                this.onTriggerClick();
            }
            if ( index === active_idx ) {
                button.toggle();
                return;
            }
            this.toggleCheckboxEnabled();
            card.layout.setActiveItem( index );
        },

        toggleCheckboxEnabled : function() {
            var view       = this.getServiceView();
            var checkboxes = view.query('checkbox');
            Ext.each(
                checkboxes, 
                function(cb) {
                    if ( cb.isDisabled() ) {
                        cb.enable();
                    }
                    else {
                        cb.disable();
                    }
                }
            );
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
                sb.fireEvent( 'click', sb );
            }
        },
        
        onSearchWindowTabchange : function( tab_panel, new_card, old_card ) {
            var tf = new_card.query( 'textfield:first' );
            tf[0].focus( true, 20 );
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
            var params;
            var srv_store = this.getServiceStore();
            if ( srv_store.getTotalCount() > 0 ) {
                params = this.getCheckboxParams( checkbox, newVal );
                var rules     = this.getRulesStore();
                rules.load( { params : params } );
            }
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
                                      var t = search_window.query(
                                          'form > tabpanel fieldset > textfield'
                                      );
                                      t[0].focus( true, 20 );
                                  }
                                );
            }
            search_window.show();
        }
    }
);