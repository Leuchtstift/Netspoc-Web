Ext.ns("NetspocWeb.window");

/**
 * @class NetspocWeb.window.PrintWindow
 * @extends Ext.Window
 * A class to hsmanage choice of owner to use after being logged in.
 * @constructor
 */

NetspocWeb.window.PrintWindow = Ext.extend(
    Ext.Window, {

	initComponent : function() {
            // Force defaults
            Ext.apply( this,
 		       {
			   title       : 'Druckformat auswählen',
 			   width       : 660, 
 			   height      : 570,
 			   layout      : 'fit',
			   resizable   : false,
			   closeAction : 'hide',
 			   items       : [
			       this.buildPanels()
 			   ],
			   focus     : function() {  // Focus
 			   }
		       }
		     );
	    
            NetspocWeb.window.PrintWindow.superclass.initComponent.call(this);
	},
	
	// Build four panels showing possible ways of printing.
	buildPanels : function() {

	    var apply_fx = function( p, opt ) {
		p.el.scale( 300, 220 );
		p.el.addListener(
		    'mouseenter',
		    function ( event ) {
			p.el.scale( 310, 230 );
		    }
		);
		p.el.addListener(
		    'mouseleave',
		    function ( event ) {
			p.el.scale( 300, 220 );
		    }
		);
		if ( opt === 'scale_only' ) {
		    return;
		}
		p.body.on(
		    'click',
		    function ( event, html_el, options ) {

			// Hide parent window.
			var wnd = this.findParentByType( 'window' );
			wnd.hide();

			var reader = new Ext.data.JsonReader(
			    {
    				totalProperty   : 'totalCount',
				successProperty : 'success',
				root            : 'records',
				remoteSort      : false,
				fields      : [
				    { name : 'service', mapping : 'service'  },
				    { name : 'action',  mapping : 'action'  },
				    { name : 'src',     mapping : function( node ) {
					  return node.src.join( '<br>' );
				      }
				    },
				    { name : 'dst',      mapping : function( node ) {
					  return node.dst.join( '<br>' );
				      }
				    },
				    { name : 'proto',      mapping : function( node ) {
					  return node.proto.join( '<br>' );
				      }
				    }
				]
			    }
			);

			var grid_colmodel = new Ext.grid.ColumnModel(
			    {
				columns : [
				    {
					header    : 'Dienst',
					dataIndex : 'service'
				    },
				    {
					header    : 'Aktion',
					dataIndex : 'action'
				    },
				    {
					header    : 'Quelle',
					dataIndex : 'src',
					groupable : false
				    },
				    {
					header    : 'Ziel', 
					dataIndex : 'dst'
				    },
				    {
					header    : 'Protokoll',
					dataIndex : 'proto'
				    }
				]
			    }
			);
			
			var singular = "Regel";
			var plural   = "Regeln";

			// Change ColumnModel and JsonReader appropriately.
			if ( opt === 'get_services_owners_and_admins' ) {
			    grid_colmodel =  new Ext.grid.ColumnModel(
				{
				    columns : [
					{
					    header    : 'Dienst',
					    dataIndex : 'service'
					},
					{
					    header    : 'Verantwortlichkeit',
					    dataIndex : 'srv_owner'
					},
					{
					    header    : 'Verantwortliche Personen',
					    dataIndex : 'admins'
					}
				    ]
				}
			    );
			    reader =  new Ext.data.JsonReader(
				{
    				    totalProperty   : 'totalCount',
				    successProperty : 'success',
				    root            : 'records',
				    remoteSort      : false,
				    fields      : [
					{ name : 'service',   mapping : 'service'  },
					{ name : 'srv_owner', mapping : function( node ) {
					      return node.srv_owner.join( '<br>' );
					  }
					},
					{ name : 'admins',    mapping : function( node ) {
					      return node.admins.join( '<br>' );
					  }
					}
				    ]
				}
			    );
			    singular = "Verantwortliche";
			    plural   = "Verantwortlicher";
			}
			
			var tpl = '{text} ({[values.rs.length]} ' +
			    '{[values.rs.length > 1 ? "' + plural +
			    '" : "' + singular + '" ]})';

			var grid_view = new Ext.grid.GroupingView(
			    {
				forceFit          : true,
				hideGroupedColumn : true,
				groupTextTpl      : tpl
			    }
			);

			var store = {
			    xtype       : 'groupingstatestore',
			    proxyurl    : opt,
			    autoLoad    : false,
			    reader      : reader,
			    sortInfo    : {
				field     : 'service',
				direction : 'ASC'
			    },
			    groupOnSort : true,
			    remoteGroup : true,
			    groupField  : 'service'
			};

			var tbar = [
			    'Drucken:',
			    {
				iconCls : 'icon-printer',
				tooltip : 'Druck-Fenster öffnen',
				scope   : this,
				handler : function ( button ) {
				    var grid = button.findParentByType( 'grid' );
				    Ext.ux.Printer.print( grid );
				}
			    }
			];
			
			// Collect displayed services in policylist
			// as CSV-string (will be passed as URL-param).
			var services = '';
			var viewport = Ext.getCmp( 'viewportId' );
			var pl       = viewport.findByType( 'policylist' );
			var pl_view  = pl[0].getView();
			var pl_store = pl[0].getStore();
			var concat_services = function ( rec ) {
			    var srv_name = rec.get( 'name' );
			    if ( srv_name ) {
				services = services + srv_name + ',';
			    }
			    else {
				return;
			    }
			};
			var records  = pl_store.each( concat_services );
			// Get rid of trailing comma
			services = services.slice(0, -1);

			// Without services it does not make 
			// sense to continue ...
			if ( services === '' ) {
			    return;
			}
			
			// Create GridPanel with or without grouping
			// as needed.
			var grid;
			if ( opt === 'services_only' ) {
			    if ( pl_view ) {
				grid = new Ext.grid.GridPanel(
				    {
					store      : pl_view.store,
					tbar       : tbar,
					viewConfig : {
					    forceFit : true
					},
					columns    : pl_view.columns
				    }
				);
				
			    }
			}
			else {
			    grid = new Ext.grid.GridPanel(
				{
				    store     : store,
				    colModel  : grid_colmodel,
				    view      : grid_view,
				    tbar      : tbar,
				    listeners : {
					beforerender : function ( thisgrid ) {
					    thisgrid.getStore().load(
						{
						    'params' : {
							'services' : services
						    }
						}
					    );
					}
				    }
				}
			    );
			}

			var title = {
			    'get_services_and_rules' : 'Dienste und Regeln im ' + 
				'expandierten Format',
			    'get_services_owners_and_admins' : 'Dienste und '
				+ 'Verantwortlichkeiten',
			    'services_only' : 'Liste der aktuell gewählten Dienste'	    
			};

			var w = new Ext.Window(
 			    {
				title       : title[opt],
				id          : 'srvRulesWndId', // see PolicyManager
 				width       : 640, 
 				height      : 480,
 				layout      : 'fit',
				resizable   : true,
 				items       : [
				    grid
 				]
			    }
			);
			w.show();
		    },
		    p  // the panel as scope
		);
	    };

	    var panel1 = {
		width     : 320,
		height    : 240,
		baseCls   : 'print-services',
		listeners : {
		    afterrender : function ( p ) {
			apply_fx( p, 'get_services_and_rules' );
		    }
		}
	    };
	    var panel2 = {
		width     : 320,
		height    : 240,
		baseCls   : 'print-services-owner-admins',
		listeners : {
		    afterrender : function ( p ) {
			apply_fx( p, 'get_services_owners_and_admins' );
		    }
		}
	    };
	    var panel3 = {
		width     : 320,
		height    : 240,
		baseCls   : 'print-services-only',
		listeners : {
		    afterrender : function ( p ) {
			apply_fx( p, 'services_only' );
		    }
		}
	    };
	    var panel4 = {
		width     : 320,
		height    : 240,
		baseCls   : 'print-services-user-owner',
		listeners : {
		    afterrender : function ( p ) {
			apply_fx( p, 'scale_only' );
		    }
		}

	    };
	    var top_left = {
		width  : 320,
		height : 25,
		html   : '<h3> Dienste mit expandierten Regeln </h3>'
	    };
	    var top_right = {
		width  : 320,
		height : 25,
		html   : '<h3> Dienste mit Verantwortlichkeiten </h3>'
	    };
	    var top_labels =  {
		layout : 'hbox',
		items  : [
		    top_left,
		    top_right
		]
	    };
	    var bottom_left = {
		width  : 320,
		height : 25,
		html   : '<h3> Liste der Dienste (ohne Regeln)</h3>'
	    };
	    var bottom_right = {
		width  : 320,
		height : 25,
		html   : '<h3> Verantwortlichkeiten mit zugehörigen Diensten </h3>'
	    };
	    var bottom_labels =  {
		layout : 'hbox',
		items  : [
		    bottom_left,
		    bottom_right
		]
	    };
	    var top_row = {
		layout : 'hbox',
		items  : [
		    panel1,
		    panel2
		]
	    };
	    var bottom_row = {
		layout : 'hbox',
		items  : [
		    panel3,
		    panel4
		]
	    };

	    var container_panel = {
		layout : 'anchor',
		frame  : true,
		items  : [
		    top_labels,
		    top_row,
		    bottom_labels,
		    bottom_row
		],
		listeners : {
		    afterrender : function(p) {
			//p.el.boxWrap( "x-box-blue" );
		    },
		    single : true  // Remove the listener after first invocation
		}
	    };
	    return container_panel;
	},

	onPanelClick : function () {
	    //console.log( "HERE!" );
	},
	
    } // end of params extending window class
);


