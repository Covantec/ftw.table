Ext.Ajax.timeout = 120000;  // 2 minutes

// EXTJS overrides

// These overrides are required to prevent the table from scrolling
// on row selection due to focus change in the `mouseDown` event.
// See https://github.com/4teamwork/ftw.table/issues/31 for details.


Ext.override(Ext.grid.RowSelectionModel, {
    handleMouseDown : function(g, rowIndex, e){
        if(e.button !== 0 || this.isLocked()){
            return;
        }
        var view = this.grid.getView();
        if(e.shiftKey && !this.singleSelect && this.last !== false){
            var last = this.last;
            this.selectRange(last, rowIndex, e.ctrlKey);
            this.last = last;
            /* PATCHED */
            //view.focusRow(rowIndex);
        }else{
            var isSelected = this.isSelected(rowIndex);
            if(e.ctrlKey && isSelected){
                this.deselectRow(rowIndex);
            }else if(!isSelected || this.getCount() > 1){
                this.selectRow(rowIndex, e.ctrlKey || e.shiftKey);
                /* PATCHED */
                //view.focusRow(rowIndex);
            }
        }
    },

});


Ext.grid.FTWTableGroupingView = Ext.extend(Ext.grid.GroupingView, {
  // private
  onGroupByClick : function(){
      if(store.baseParams['groupBy'] && this.grid.store.sortInfo.field == 'draggable') {
          // we are grouping and sorting by draggable - do not allow this.
          // let's just sort by the groupBy-column
          this.grid.store.sort(store.baseParams['groupBy'], 'ASC');
      }

      if(typeof(tabbedview) != "undefined") {
          tabbedview.param('groupBy', this.cm.getDataIndex(this.hdCtxIndex));
          tabbedview.reload_view();
      } else {
          Ext.grid.GroupingView.superclass.onGroupByClick.call(this);
      }
  },

  // private
  onShowGroupsClick : function(mi, checked){
      if (typeof(tabbedview) != "undefined") {
          this.enableGrouping = checked;
          if (checked) {
              this.onGroupByClick();
          } else {
              tabbedview.reload_page_keeping_profile();
          }
      } else {
          Ext.grid.GroupingView.superclass.onShowGroupsClick.call(this, mi, checked);
      }
  },

  // private
  onColumnWidthUpdated : function(col, w, tw){
    Ext.grid.GroupingView.superclass.onColumnWidthUpdated.call(this, col, w, tw);
    this.updateGroupWidths();

    //set width of the header div to the same value as the table
    //we need a few extra pixel to make the resizable handle draggable
    var inner_width = $('.x-grid3-header table').width() + 5;
    $('.x-grid3-header').width(inner_width);
    $('.x-grid3-header-offset').width(inner_width);
  }
});

function reset_grid_state() {
  $.ajax({
    url: '@@tabbed_view/setgridstate',
    cache: false,
    type: "POST",
    data: {
       gridstate: "{}",
       view_name: stateName(),
       "grid-state-profile": tabbedview.param('grid-state-profile')
    },
    success: function() {
      tabbedview.reload_page_keeping_profile();
    }
  });
}

Ext.state.FTWPersistentProvider = Ext.extend(Ext.state.Provider, {
  constructor : function(config){
    Ext.state.FTWPersistentProvider.superclass.constructor.call(this);
    Ext.apply(this, config);
  },

  // private
  set : function(name, value){
    Ext.state.FTWPersistentProvider.superclass.set.call(this, name, value);

    if(store.reader.meta.config.group != undefined ||
       grid.colModel.getColumnById('groupBy') != undefined){
        // store nothing on the server while grouping.
        return;
    }

    //set width of the header div to the same value as the table
    //we need a few extra pixel to make the resizable handle draggable
    var inner_width = $('.x-grid3-header table').width() + 5;
    $('.x-grid3-header').width(inner_width);
    $('.x-grid3-header-offset').width(inner_width);

    $.ajax({
      url: '@@tabbed_view/setgridstate',
      cache: false,
      type: "POST",
      data: {
        // XXX does JSON.stringify work always?
        gridstate: JSON.stringify(this.state[name]),
        view_name: stateName(),
        "grid-state-profile": tabbedview.param('grid-state-profile')
      }
    });
  },

  get : function(name, defaultValue){
    if(!this.state[name] && store.reader.meta.config.gridstate) {
      this.state[name] = JSON.parse(store.reader.meta.config.gridstate);
    }
    return typeof this.state[name] == "undefined" ?
      defaultValue : this.state[name];
  }


});


// create closure
//
(function($) {
  $this = null; // reference to the jQuery table object
  store = null;
  grid = null;
  var options = null;
  var locales = {}; // Stores the translated strings fetched from
  // the server. Use translate(msgid, defaultValue)
  Ext.state.Manager.setProvider(new Ext.state.FTWPersistentProvider());

  $.fn.ftwtable.createTable = function(table, url, opts){
    if(typeof(tabbedview) != "undefined") {
      tabbedview.show_spinner();
    }
    options = opts;
    $this = table;
    store = new Ext.data.GroupingStore({
      // set up the store
      remoteSort: true,
      autoLoad: false,
      groupField: '', // kinda ugly way to trick the table into disable grouping by default
      remoteGroup: false,
      autoDestroy:false,

      //params that will be sent with every request
      baseParams: {
        ext: 'json',
        tableType: 'extjs', // lets the server know that this is a request from EXTJS ...
        mode: 'json', // ... and that we want JSON data to be returned
        omit_metadata: '0' // when 1, keep column defitions
      },

      proxy: new Ext.data.HttpProxy({
        url: url,
        method: 'POST',
        disableCaching: true // adds a unique cache-buster GET param to requests
        // TODO: autoAbort isn't working yet in EXTJS 3.3.0.
        // autoAbort: true, // Automatically aborts previous AJAX requests
      }),

      // JSON Reader is configured using the data contained in the AJAX response
      reader: new Ext.data.JsonReader(),

      listeners: {

        beforeload: function(store, options) {
            Ext.state.Manager.getProvider().state = {};
            jQuery.tabbedview.show_spinner();
        },

        datachanged: function(store) {
            if (typeof(store.reader.jsonData.static_html) != 'undefined'){
                $.each(store.reader.jsonData.static_html, function(key, value) {
                    $('#'+key+'_container.ftwtable').html(value);
                });
            }
            jQuery.tabbedview.hide_spinner();
        },

        // will be called if we get new metadata from the server. E.g. diffrent columns.
        metachange : function(store, meta){
          if(store.reader.meta.config.group != undefined){
            store.groupField = store.reader.meta.config.group;
          }

          // On metadachange we have to create a new grid. Therefore destroy the old one
          if (grid && store.reader.meta.config.group == undefined){
            // if the grid exists, let the state provider store
            // our config
            Ext.state.Manager.set(stateName(), grid.getState());
            // and destroy the grid
            grid.destroy();
          }

          // translations contains the translated strings that will be used in the ui.
          locales = store.reader.meta.translations;
          // sorting information
          store.sortInfo = {
            field: store.reader.meta.config.sort,
            direction: store.reader.meta.config.dir
          };

          var sm =  new Ext.grid.RowSelectionModel({listeners: {
            selectionchange: function(smObj) {
              var records = smObj.selections.map;
              var ds = this.grid.store;
              $this.find('input.selectable:checked').attr('checked', false);
              $.each(records, function(key, value){
                var index = ds.indexOfId(key);
                $('input.selectable').eq(index).attr('checked', true);
              });
            }
          }});

          var columns = store.reader.meta.columns;
          // workaround to make the last column resizeable in IE - add an
          // empty column
          columns.push({
            dataIndex: "dummy",
            header: "",
            id: "dummy",
            menuDisabled: true,
            sortable: false,
            width: 1,
            hidden: true,
            hideable: false,
            fixed: false});

          // Set up the ColumnModel
          var cm = new Ext.grid.ColumnModel({
            columns: columns,
            defaults: {
              sortable: false,
              menuDisabled: false,
              width: 110
            }
          });

          var grid_plugins = new Array(new Ext.ux.dd.GridDragDropRowOrder({
              copy: false, // false by default
              scrollable: true, // enable scrolling support (default is false)
              targetCfg: {}, // any properties to apply to the actual DropTarget
              listeners: {

                afterrowmove: function(dropTarget, rowIndex, rindex, selections){
                  var new_order = [];
                  for(var i = 0; i<store.getCount(); i++){
                    new_order.push(store.getAt(i).json.id);
                  }
                  $.ajax({
                    url: '@@tabbed_view/reorder',
                    cache: false,
                    type: "POST",
                    data: {
                      new_order: new_order
                    }
                  });
                }
              }
            }));

          if (Ext.ux.grid && typeof(Ext.ux.grid.GridFilters) != 'undefined') {
              var filtered_columns = function() {
                  var cols = new Array();
                  for(var i=0; i<columns.length; i++) {
                      var col = columns[i];
                      if (col.filter) {
                          var filter = col.filter;
                          filter['dataIndex'] = col.dataIndex;
                          cols.push(filter);
                      }
                  }
                  return cols;
              }();

              grid_plugins.push(new Ext.ux.grid.GridFilters({
                  local: false,
                  filters: filtered_columns
              }));
          }

          grid = new Ext.grid.GridPanel({
            //set up the GridPanel
            columnLines: true,
            store: store,
            cm: cm,
            stripeRows: true,
            autoHeight:true,
            stateful: true,
            stateId: stateName(),
            xtype: "grid",

            //XXX: GridDragDropRowOrder has to be the first plugin!
            plugins: grid_plugins,

            view: new Ext.grid.FTWTableGroupingView({
              groupMode:'value',
              hideGroupedColumn: true,
              //enableGrouping:false,
              // Text visible in the grids ui.
              sortDescText: translate('sortDescText', 'Sort Descending'),
              sortAscText: translate('sortAscText', 'Sort Ascending'),
              columnsText: translate('columnsText', 'Columns'),
              showGroupsText: translate('showGroupsText', 'Show in Groups'),
              groupByText: translate('groupByText', 'Group By This Field'),
              // E.g.: Auftragstyp: Zum Bericht / Antrag (2 Objekte)
              groupTextTpl: '{text} ({[values.rs.length]} {[values.rs.length > 1 ? "'+translate('itemsPlural', 'Items')+'" : "'+translate('itemsSingular', 'Item')+'"]})',
              showGroupName: false
            }),

            sm: sm,

            listeners: {
              beforerender: function(grid) {
                // When the state is loaded, somehow the columns
                // marked as hidden are not set to hidden
                // automatically in the column model. So let's hide
                // them manually before rendering.
                var state = Ext.state.Manager.get(stateName());
                if(state) {
                  for(var i=0; i<state.columns.length; i++) {
                    if(state.columns[i].hidden) {
                      var index = grid.colModel.getIndexById(state.columns[i].id);
                      if(index !== -1) {
                        grid.colModel.setHidden(index, true);
                      }
                    }
                  }
                }
              },

              viewready: function(grid) {
                // Somehow the width of columns, which was stored
                // persistently in the grid state, is overriden while
                // rendering the grid. After everything is visible we
                // need to fix the width of each column.
                var state = Ext.state.Manager.get(stateName());
                if(state) {
                  for(var i=0; i<state.columns.length; i++) {
                    var index = grid.colModel.getIndexById(state.columns[i].id);
                    if(index !== -1) {
                      grid.colModel.setColumnWidth(index, state.columns[i].width);
                    }
                  }
                }

                //ugly hacks we need to use horizontal scrolling combined with autoHeight
                //enable horizontal scrolling
                $('.x-grid3-viewport').css('overflow', 'auto');

                // Checkboxes / radios are usually have the
                // "selectable" css class. When using a extjs
                // selection model, they are not selectable anymore
                // because of the event handling system of
                // extjs. Therefore we disable the click event on checkboxes.
                $(".selectable").click(function(event) {
                  event.preventDefault();
                });
                // pre-selected checkboxes should be selected rows. We have to
                // tell ext-js to select these
                var sm = grid.getSelectionModel();
                $("input[checked=checked]").each(function(i, e) {
                  sm.selectRow($(e).closest(".x-grid3-row").index(), 1);
                });

                /* Hide the "No contents" element if we have
                   no contents */
                $('#message_no_contents').hide();

                /* Hide the dummy column which is used for giving the last column
                   a resize handle. */
                $('.x-grid3-hd.x-grid3-td-dummy > *').remove();
                $('.x-grid3-hd.x-grid3-td-dummy').css(
                    'display', 'table-cell').css(
                    'width', '5px').css(
                    'border', 'none');

                if(typeof(tabbedview) != "undefined") {
                  tabbedview.hide_spinner();
                }
              },

              afterrender: function(panel){
                  this._update_dragndrop_state();
                  options.onLoad();
                  store.baseParams['omit_metadata'] = '1';
                  $this.trigger('gridRendered');
              },

              sortchange: function(panel, sortInfo) {
                  this._update_dragndrop_state();
              }
            },

            _update_dragndrop_state: function() {
                if(!this.viewReady) {
                    return;
                }
                // Dragndrop should only be available when sorting by 'draggable'.
                var plugin = this._get_dragndrop_plugin();
                if(!plugin) {
                    return;
                }

                var col = grid.colModel.getColumnById('draggable');
                if(!col) {
                    return;
                }

                if(store.sortInfo.field == 'draggable'){
                    // enable grouping
                    plugin.target.unlock();
                    grid.ddText = translate('selectedRowen', '{0} selected rowen{1}');
                    $this.removeClass('draglocked');

                    // do not allow to change the sort direction when sorting by 'draggable'
                    if(store.sortInfo.direction == 'DESC') {
                        store.sort(sortInfo.field, 'ASC');
                    }
                    col.sortable = false;
                }

                else {
                    // desable grouping
                    plugin.target.lock();
                    grid.ddText = translate('dragDropLocked', "Drag 'n' Drop not possible");
                    $this.addClass('draglocked');
                    col.sortable = true;
                }
            },

            _get_dragndrop_plugin: function() {
                if (!Ext.ux || typeof(Ext.ux.dd.GridDragDropRowOrder) == 'undefined') {
                    return null;
                }

                for(var i=0; i<this.plugins.length; i++) {
                    if (this.plugins[i] instanceof Ext.ux.dd.GridDragDropRowOrder) {
                        return this.plugins[i];
                    }
                }

                return null;
            }
          });
          // end grid=

          // set up autoExpandColumn
          if(store.reader.meta.config.auto_expand_column!=undefined){
            grid.autoExpandColumn = store.reader.meta.config.auto_expand_column;
            grid.autoExpandMin = 200;
            grid.autoExpandMax = 300;
          }

          // render the table if ther're records to show.
          if(store.reader.jsonData.rows.length){
            grid.render($this.attr('id'));
          }else{
            //show message and abord
            $('#message_no_contents').show();
            if(typeof(tabbedview) != "undefined") {
              tabbedview.hide_spinner();
            }
            return;
          }
        }
      }
    });

    // start the magic.
    store.load();

  };

  translate = function(key, defaultValue){
    if(locales[key]){
      return locales[key];
    }else{
      return defaultValue || key;
    }
  };

  stateName = function() {
    // returns the name of the state - which includes the current tab
    // since multiple states are present when switching between tabs
    // in tabbedview
    if(typeof(tabbedview) != "undefined") {
      return tabbedview.prop('view_name').replace('.', '-');
    } else {
      return location.href.split('/').reverse()[0].replace('.', '-').replace('@', '');
    }
  };

  $.fn.ftwtable.reloadTable = function(table, query, options){
    $.fn.ftwtable.destroy();
    $.fn.ftwtable.createTable(table, query, options);
  };

  $.fn.ftwtable.destroy = function(){
    if(typeof(tabbedview) != "undefined") {
      tabbedview.flush_params('groupBy');
    }
    Ext.state.Manager.clear(stateName());
    if(grid && grid.boxReady){
      grid.destroy();
    }
    if(store){
      store.destroy();
    }
    $this = null;
    store = null;
    grid = null;
  };

  $.fn.ftwtable.goto_page = function(pagenumber) {
    store.baseParams['pagenumber:int'] = pagenumber;
    jQuery.tabbedview.show_spinner();
    store.reload();
  };

  $.fn.ftwtable.select = function(start, end){
    var sm = grid.getSelectionModel();
    if (start=='all'){
      sm.selectRange(0, store.totalLength-1);
    }else if (start && end){
      sm.selectRange(start, end);
    } else if (end == undefined){
      sm.selectRow(start);
    }
  };

  $.fn.ftwtable.deselect = function(start, end){
    var sm = grid.getSelectionModel();
    if (start=='all'){
      sm.deselectRange(0, store.totalLength-1);
    }else if (start && end){
      sm.deselectRange(start, end);
    } else if (end == undefined){
      sm.deselectRow(start);
    }
  };

    $(document).keyup(function(event) {
        /* on ENTER, open all selected issues in a new tab */
        var src = $(event.srcElement);
        if(event.keyCode == 13 && !src.is('input') && !src.is('textarea')) {
            $('.x-grid3-row-selected .default-link').each(function() {
                if($.browser.webkit === true) {
                    /* open link in new tab by simulating a mouse event with pressed ctrl / cmd keys */
                    var evt = document.createEvent("MouseEvents");
                    evt.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0,
                                       true, false, false, true, 0, null);
                    this.dispatchEvent(evt);
                } else {
                    window.open($(this).attr('href'), '_blank');
                }
            });
        }
    });

  //
  // end of closure
  //
})(jQuery);
