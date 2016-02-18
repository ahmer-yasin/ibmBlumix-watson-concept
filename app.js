'use strict';

var express = require('express'),
  app = express(),
  extend = require('util')._extend,
  watson = require('watson-developer-cloud'),
  async  = require('async'),
  morgan = require('morgan');
app.use(morgan('combined'));

// Bootstrap application settings
require('./config/express')(app);

// if bluemix credentials exists, then override local
var credentials = extend({
  username: '17207cc2-8596-4335-8810-d01f3c9e2658',
  password: "MnUBHfMC1yH4",
  version: 'v2'
}); // VCAP_SERVICES

var corpus_id = process.env.CORPUS_ID || '/corpora/public/TEDTalks';
var graph_id  = process.env.GRAPH_ID ||  '/graphs/wikipedia/en-20120601';

// Create the service wrapper
var conceptInsights = watson.concept_insights(credentials);

app.get('/api/labelSearch', function(req, res, next) {
  var params = extend({
    corpus: corpus_id,
    prefix: true,
    limit: 5,
    concepts: true
  }, req.query);

  conceptInsights.corpora.searchByLabel(params, function(err, results) {
    if (err)
      return next(err);
    else
      res.json(results);
  });
});

app.get('/api/conceptualSearch', function(req, res, next) {
  var params = extend({ corpus: corpus_id, limit: 5 }, req.query);
  conceptInsights.corpora.getRelatedDocuments(params, function(err, data) {
    if (err)
      return next(err);
    else {
      async.parallel(data.results.map(getPassagesAsync), function(err, documentsWithPassages) {
        if (err)
          return next(err);
        else{
          data.results = documentsWithPassages;
          res.json(data);
        }
      });
    }
  });
});

app.post('/api/extractConceptMentions', function(req, res, next) {
  var params = extend({ graph: graph_id }, req.body);
  conceptInsights.graphs.annotateText(params, function(err, results) {
    if (err)
      return next(err);
    else
      res.json(results);
  });
});

/**
 * Builds an Async function that get a document and call crop the passages on it.
 * @param  {[type]} doc The document
 * @return {[type]}     The document with the passages
 */
var getPassagesAsync = function(doc) {
  return function (callback) {
    conceptInsights.corpora.getDocument(doc, function(err, fullDoc) {
      if (err)
        callback(err);
      else {
        doc = extend(doc, fullDoc);
        doc.explanation_tags.forEach(crop.bind(this, doc));
        delete doc.parts;
        callback(null, doc);
      }
    });
  };
};

/**
 * Crop the document text where the tag is.
 * @param  {Object} doc The document.
 * @param  {Object} tag The explanation tag.
 */
var crop = function(doc, tag){
  var textIndexes = tag.text_index;
  var documentText = doc.parts[tag.parts_index].data;

  var anchor = documentText.substring(textIndexes[0], textIndexes[1]);
  var left = Math.max(textIndexes[0] - 100, 0);
  var right = Math.min(textIndexes[1] + 100, documentText.length);

  var prefix = documentText.substring(left, textIndexes[0]);
  var suffix = documentText.substring(textIndexes[1], right);

  var firstSpace = prefix.indexOf(' ');
  if ((firstSpace !== -1) && (firstSpace + 1 < prefix.length))
      prefix = prefix.substring(firstSpace + 1);

  var lastSpace = suffix.lastIndexOf(' ');
  if (lastSpace !== -1)
    suffix = suffix.substring(0, lastSpace);

  tag.passage = '...' + prefix + '<b>' + anchor + '</b>' + suffix + '...';
};

// error-handler settings
require('./config/error-handler')(app);

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);
