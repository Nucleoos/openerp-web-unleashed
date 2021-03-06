odoo.unleashed.module('web_unleashed', function(base, require, _, Backbone){

    odoo.define_section('web_unleashed - Backbone Sync Connector', [], function (test, mock) {

        var Connector = base.utils('Connector');
        var Model = null;

        var sync = odoo.unleashed.sync = function(method, model, options){
            if(!model.model_name){
                throw unleashed.error(
                    "'model_name' is not defined on Backbone Model/Collection."
                );
            }
            options = options || {};
            var Connector = base.utils("Connector");

            // instantiate a JSON-RPC model object to communicate with Odoo by JSON-RPC
            var connection = new Model(
                model.model_name,
                options.context || {},
                options.domain || []
            );

            return Connector[method](model, options, connection);
        };

        /**
         * list of parameters follow the bellow order
         * @param {0}: name of the test
         * @param {1}: dependencies
         * @param {2}: test body
         **/
        test('fetch', ["web.Model"], function (assert, ModelTest) {
            assert.expect(2);
            Model = ModelTest;

            // FIXME: mocking does not work, real RPC still reach the server
            // fake response to JSON-RPC call
            mock.add('/web/dataset/search_read', function (call) {
                //return 100 items by default
                var result = [];
                for(var i=1 ; i <= 100 ; i++){
                    result.push({id: i, name: 'item ' + i});
                }
                return { records: result };
            });

            // use custom sync with Model provided by the testing
            var List = Backbone.Collection.extend({
                model_name: 'unit.test', sync: sync
            });
            var list = new List();

            return list.fetch().then(function(results){
                strictEqual(list.length, 100, '100 should be fetched');
                strictEqual(list.get(42).get('name'), 'item 42', '42nd item should be named "item 42"');
            });
        });

        test('fetch with filter', ["web.Model"], function (assert, TestModel) {
            assert.expect(6);
            Model = TestModel;

            mock.add('/web/dataset/search_read', function (call) {
                var result = [];

                var offset = call.params.offset ? call.params.offset : 1;
                var limit = call.params.limit ? call.params.limit : 100;
                var reverse = !!(call.params.sort && call.params.sort != '');
                var domain = call.params.domain.length > 0 ? call.params.domain[0] : null;

                if(reverse){
                    var _offset = offset;
                    offset = limit;
                    limit = _offset;
                }

                for(var i = offset ; (reverse ? i >= limit : i <= (offset + limit) - 1) ; (reverse ? i-- : i++)){
                    if(!domain
                    || domain && domain[1] == '=' && domain[2] == i
                    || domain && domain[1] == '<=' && domain[2] >= i){
                        result.push({id: i, name: 'item ' + i});
                    }
                }

                return { records: result };
            });

            var List = Backbone.Collection.extend({
                model_name: 'unit.test', sync: sync
            });

            var list = new List();

            var t1 = list.fetch({
                filter: [['id', '=', '42']]
            })
            .done(function(results){
                strictEqual(list.length, 1, '1 item should be fetched');
                strictEqual(list.at(0).get('name'), 'item 42', 'first item should be named "item 42"');
            });

            var t2 = list.fetch({
                filter: [['id', '<=', '42']],
                order: ['-id']
            }).done(function(results){
                strictEqual(list.length, 42, '42 items should be fetched');
                strictEqual(list.at(0).get('name'), 'item 42', 'first item should be named "item 42"');
            });

            var t3 = list.fetch({
                limit: 10,
                offset: 42
            }).done(function(results){
                strictEqual(list.length, 10, '10 items should be fetched');
                strictEqual(list.at(0).get('name'), 'item 42', 'first item should be named "item 42"');
            });

            return $.when(t1, t2, t3);
        });

        test('fetch with group_by', ["web.Model"], function (assert, TestModel) {
            assert.expect(21); // number of test expect should be 21
            Model = TestModel;

            var Query = base.models('GroupQuery');

            //fake response to JSON-RPC call
            var group_mock = function(call){
                if(call.params.method == 'read_group'){
                    var arg = call.params.kwargs;
                }
                // fake group by, return 2 groups
                return [
                    { category: 'cat1', count: 5, __domain: [[ 'category', '=', 'cat1' ]] },
                    { category: 'cat2', count: 10, __domain: [[ 'category', '=', 'cat2' ]] }
                ];
            };

            // define 2 mocks, for prod and dev mode...
            mock.add('/web/dataset/call_kw', group_mock);
            mock.add('/web/dataset/call_kw/unit.test/read_group', group_mock);
            mock.add('/web/dataset/search_read', function (call) {
                var result = [];

                var domain = call.params.domain[0][2],
                    offset = 0,
                    limit = 0;

                if(domain == 'cat1'){
                    limit = 5;
                }
                else if(domain == 'cat2'){
                    offset = 5;
                    limit = 15;
                }
                else if(domain == 'not grouped'){
                    limit = 15;
                }

                for(var i = offset ; i < limit ; i++){
                    result.push({id: i, name: 'item ' + i, category: domain});
                }

                return { records: result };
            });

            var List = Backbone.Collection.extend({
                model_name: 'unit.test', sync: sync
            });

            var def1 = $.Deferred();
            var list = new List();

            var t1 = list.fetch({
                group_by: ['category']
            })
            .done(function(results){
                strictEqual(list.length, 2, '2 group queries');

                strictEqual(list.at(0).get('value'), 'cat1', 'query group 1: category = cat1');
                strictEqual(list.at(0).get('count'), 5, 'query group 1: 5 elements');

                strictEqual(list.at(1).get('value'), 'cat2', 'query group 2: category = cat2');
                strictEqual(list.at(1).get('count'), 10, 'query group 2: 10 elements');

                var q1 = list.at(0), q2 = list.at(1);

                var p1 = q1.fetch().done(function(){
                    strictEqual(q1.group instanceof List, true, 'group 1: is instance of List');
                    strictEqual(q1.group.length, 5, 'group 1: 5 group results');
                    strictEqual(q1.group.at(1).get('name'), 'item 1', 'group 1: correct name for 2nd group model');
                    strictEqual(q1.group.at(2).get('category'), 'cat1', 'group 1: correct category for 3nd group model');
                    strictEqual(q1.group.at(3).get('id'), 3, 'group 1: correct id for 4st group model');
                });

                var p2 = q2.fetch().done(function(){
                    strictEqual(q2.group instanceof List, true, 'group 2: is instance of List');
                    strictEqual(q2.group.length, 10, 'group 2: 10 group results');
                    strictEqual(q2.group.at(1).get('name'), 'item 6', 'group 2: correct name for 2nd group model');
                    strictEqual(q2.group.at(2).get('category'), 'cat2', 'group 2: correct category for 3nd group model');
                    strictEqual(q2.group.at(3).get('id'), 8, 'group 2: correct id for 4st group model');
                });

                $.when(p1, p2).done(function(){
                    def1.resolve();
                });
            });

            var CustomQuery = Query.extend({
                customGroupQueryMethod: function(){}
            });

            var t2 = list.fetch({
                group_by: ['category'],
                group_model: CustomQuery
            })
            .done(function(){
                strictEqual(list.length, 2, '2 group queries');
                strictEqual(list.at(0) instanceof CustomQuery, true, 'query group 1: is instance of CustomQuery');
                strictEqual(list.at(1) instanceof CustomQuery, true, 'query group 2: is instance of CustomQuery');
                strictEqual(_.isFunction(list.at(1).customGroupQueryMethod), true, 'query group 2: implement the custom method');
            });

            // test in without group_by again
            var t3 = list.fetch({
                filter: [['category', '=', 'not grouped']]
            })
            .done(function(){
                strictEqual(list.length, 15, '15 items');
                strictEqual(list.at(0) instanceof Query, false, 'first item is not an instance of Query');
            });

            return $.when(def1.promise(), t2, t3);
        // test end
        });

    // section end
    });
});
