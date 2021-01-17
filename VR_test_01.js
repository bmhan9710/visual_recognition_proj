
var formidable = require('formidable');
var fs = require('fs');

var express = require('express');
var app = express(); // Create server

var current_ip = '1.225.69.248';
var classifier_id_saved;
var array_classifier_id=[];     // Array for storing classifierID

// Visual Recognition declare
const VisualRecognitionV3 = require('ibm-watson/visual-recognition/v3');
const { IamAuthenticator } = require('ibm-watson/auth');

const visualRecognition = new VisualRecognitionV3({
	version: '2018-03-19',
	authenticator: new IamAuthenticator({
		apikey: '9pYVOVpNLOKprg0tztZZTEW1KcNq0aBtd94voRbN4Ci2',
	}),
	url: 'https://api.kr-seo.visual-recognition.watson.cloud.ibm.com/instances/d9230170-b9d0-4eb6-aef3-6367cb7c38ef',
});

// setup DB
var mysql = require('mysql');
var client = mysql.createConnection({ host: 'localhost', user: 'root', password: '1990' });
client.query('create database if not exists Watson_VR', function(error, result){
	if(error){ console.log('Error creating Database: ' + error);
	}else{
	}
});
client.query('use Watson_VR');

// get classifier IDs from Watson VR and store to DB
var temp_str='';
client.query('create table if not exists VR_Classifier (id varchar(45) not null, description varchar(45), primary key(id))');
visualRecognition.listClassifiers({verbose: true})  // verbose=true returns detailed info. about classifiers
.then(response => {
	var jsonresult = response.result; // process result
	var temp_classifier_id;
	for(var i=0; i<jsonresult['classifiers'].length; i++){
		array_classifier_id.push(jsonresult['classifiers'][i]['classifier_id']);
		temp_classifier_id = array_classifier_id.pop();
		client.query('insert into VR_Classifier (id, description) values ("' + temp_classifier_id + '", "Classifier ID of VR")', function(error){
			if(error){console.log('Error in inserting classifier ID. Error message: ' + error);
			} else{
		      console.log('classifier id ' + temp_classifier_id + ' insert successful');
		    }
		});
		console.log('classifier id: ' + jsonresult['classifiers'][i]['classifier_id']);
	}
}).catch(err => {
	console.log('error:', err);
}).finally(result=> {
	client.query('select * from VR_Classifier', function(error, result){
		if(error){ console.log('Error in DB select query');
		}else{
			console.log('number of classifiers: ' + result.length);
			for(var i=0; i<result.length; i++){
				console.log('id: ' + result[i]['id']);
				temp_str += '<option value="custom' + i + '">' + result[i]["id"]+ '</option>';
				array_classifier_id.push(result[i]["id"]);
			}
		console.log('initial classifier id list in html: ' + temp_str);
		}
	});
});

// this makes it possible to post files in server's directory
app.use(express.static(__dirname + '/fileupload'));


app.post('/fileClassify', function(req, res) {
	var form = new formidable.IncomingForm();
	form.parse(req, function (err, fields, files) { // this executes last
		var oldpath = files.filetoupload.path;
		var newpathdir = __dirname + '/fileupload';
		var newpath = newpathdir + '/uploadedimage.jpg';
		if (!fs.existsSync(newpathdir)){  // create directory if not exists
			fs.mkdirSync(newpathdir, function(err) { if (err) throw err; });
		}
		var selectvalue = fields['select_classifyid']; // get input from Select
    
		console.log('uploaded src path file: ' + oldpath);
		console.log('uploaded dest path file: ' + newpath);
    
		fs.rename(oldpath, newpath, function (err) {
			if (err) throw err;
		});
	
	    // Watson Visual Recognition : classify input image
	    if(selectvalue == "food" ){
	      console.log('food selected');
	      var param_classify = {  // input source image
	        imagesFile: fs.createReadStream(__dirname + '/fileupload/uploadedimage.jpg'),
	        // URL: 'http://' + current_ip + '/uploadedimage.jpg', // success
	        classifierIds: ['food'],
	      }
	    }else if(selectvalue == "explicit" ){
	      console.log('explicit selected');
	      var param_classify = {  // input source image
	        imagesFile: fs.createReadStream(__dirname + '/fileupload/uploadedimage.jpg'),
	        classifierIds: ['explicit'],
	      }
	    }else if(selectvalue == "none" ){
	      console.log('none selected');
	      var param_classify = {  // input source image
	        imagesFile: fs.createReadStream(__dirname + '/fileupload/uploadedimage.jpg')
	      }
	    }else{  // defining custom classifierID
	      for(var i=0; i<array_classifier_id.length; i++){
	        if(selectvalue == ("custom" + i)){
	          classifier_id_saved = array_classifier_id[i];
	          var threshold = 0.0;
	          var param_classify = {
	            imagesFile: fs.createReadStream(__dirname + '/fileupload/uploadedimage.jpg'),
	            classifierIds: classifier_id_saved,
	            threshold: threshold,
	          }
	        }
	      }
	    }
	    visualRecognition.classify(param_classify)
	    .then(response => {
	      // get result in json format of visual recognition
	      var jsonresult = response.result; // process result
	      var obj = jsonresult['images'][0]['classifiers'][0]['classes'];
	      obj.sort(function (a, b){ // sorting result according to score
	          return a.score >  b.score ? -1 : a.score < b.score ?  1 : 0;
	      });
	
	      res.writeHead(200, {'Content-Type': 'text/html'});
	      res.write(
	        '<head><title>Visual_Recognition Function Test</title><body>' +  
	        '<img src=/uploadedimage.jpg width="400">'
	      );
	
	      for(var i=0; i<obj.length; i++){ // display result
	        res.write(
	          '<br>* Iteration number ' + i + '<br>class: ' +
	          obj[i]['class'] + '<br>score: ' + obj[i]['score'] +
	          '<br>type_hierarchy: ' + obj[i]['type_hierarchy'] + '<br>'
	        );
	      }
	
	      // back button
	      res.write(
	        '<br><button onclick="goBack()">Go Back</button>' + 
	        '<script>function goBack() {window.history.back();}</script>' +
	        '</body></head>'
	      );
	      return res.end();
	      })
	    .catch(err => {
	      console.log('error:', err);
	    });
	});
});

app.post('/CreateTrainClassifier', function(req, res) {
	var form = new formidable.IncomingForm();
	var selectvalue;

	// requires to get multiple files from form
	form.multiples = true;
	form.parse(req, function (err, fields, files) { 
		
		if (!fs.existsSync(__dirname + '/fileupload')){  // create directory if not exists
			fs.mkdirSync(newpathdir, function(err) { if (err) throw err; });
		}
		
		console.log('files: ' + JSON.stringify(files, null, 2));
	    console.log('openedFiles length: ' + form.openedFiles.length);

	    if(form.openedFiles.length>=3){
	    	fs.rename(files['filetoupload_positive'][0]['path'], __dirname + '/fileupload/uploaded_positive0.zip', function(err){ if(err) throw err; });
	    	fs.rename(files['filetoupload_positive'][1]['path'], __dirname + '/fileupload/uploaded_positive1.zip', function(err){ if(err) throw err; });
	    	fs.rename(files['filetoupload_negative']['path'], __dirname + '/fileupload/uploaded_negative0.zip', function(err){ if(err) throw err; });
	    }else{
	    	fs.rename(files['filetoupload_positive']['path'], __dirname + '/fileupload/uploaded_positive0.zip', function(err){ if(err) throw err; });
	    	fs.rename(files['filetoupload_negative']['path'], __dirname + '/fileupload/uploaded_negative0.zip', function(err){ if(err) throw err; });
	    }
	    selectvalue = fields['select_classifyid']; // get input from select
	    
	    var positive_stream1 = fs.createReadStream(__dirname + '/fileupload/uploaded_positive0.zip');
	    var positive_stream2 = fs.createReadStream(__dirname + '/fileupload/uploaded_positive1.zip');
	    var negative_stream1 = fs.createReadStream(__dirname + '/fileupload/uploaded_negative0.zip');
	
	    var classifierName = 'GameName2';
	  
	    if(selectvalue == 'new_classifier_ID'){
	      const createClassifierParams = {
	        name: classifierName,
	        negativeExamples: negative_stream1,
	        positiveExamples: {
	          sample1: positive_stream1,
	          sample2: positive_stream2,
	        }
	      }
	      visualRecognition.createClassifier(createClassifierParams)
	      .then(response => {
	        var jsonresult = response.result;
	        classifier_id_saved = jsonresult['classifier_id'];
	        console.log('Classifier ID is: ' + classifier_id_saved);
	
	        console.log('Class 1 is: ' + jsonresult['classes'][0]['class'] );
	    
	        console.log(JSON.stringify(jsonresult, null, 2));
	
	        client.query('insert into VR_Classifier (id, description) values ("' + classifier_id_saved + '", "Classifier ID of VR")', function(error){
	          if(error){console.log('Error in creating classifier ID');}
	          else{
	            // console.log('created no: ' + result.length);
	          }
	        });
	
	        temp_str='';
	        array_classifier_id=[];
	        client.query('select * from VR_Classifier', function(error, result){
	          if(error){ console.log('Error in DB Query');
	          }else{
	            console.log('Updated IDs in SQL: ' + result.length);
	            for(var i=0; i<result.length; i++){
	              console.log('SQL id: ' + result[i]['id']);
	              temp_str += '<option value="custom' + i + '">' + result[i]["id"]+ '</option>';
	              array_classifier_id.push(result[i]["id"]);
	            }
	          }
	        });
	        console.log('updated html: ' + temp_str);
	        res.write(
	          '<head><title>Visual Recognition Classifier Creation</title><body>' +
	          '<br>Classifier ID : ' + classifier_id_saved + 
	          '<br><button onclick="goBack()">Go Back</button>' +
	          '<script>function goBack() {window.location.replace(document.referrer);}</script>' +
	          '</body></head>'
	        );
	        
	        return res.end();
	      })
	      .catch(err => {
	        console.log('error:', err);
	        res.write(
	          '<head><title>Visual Recognition Classifier ID Create Error</title><body>' +
	          '<br>Target Classifier ID : ' + classifier_id_saved +
	          '<br><button onclick="goBack()">Go Back</button>' +
	          '<script>function goBack() {window.history.back();}</script>' +
	          '</body></head>'
	        );
	        return res.end();
	      });
	    }else{
	      // train with classifierID
	
	      for(var i=0; i<array_classifier_id.length; i++){
	        if(selectvalue == ("custom" + i)){
	          classifier_id_saved = array_classifier_id[i];
	          var threshold = 0.0;
	        }
	      }
	
	      const updateClassifierParams = {
	        classifierId: classifier_id_saved,
	        negativeExamples: negative_stream1,
	        positiveExamples: {
	          sample1: positive_stream1,
	          sample2: positive_stream2,
	        }
	      }
	
	      visualRecognition.updateClassifier(updateClassifierParams)
	      .then(response => {
	        var jsonresult = response.result;
	        classifier_id_saved = jsonresult['classifier_id'];
	        console.log('Updated Classifier ID is: ' + classifier_id_saved);
	
	        // console.log('Class 1 is: ' + jsonresult['classes'][0]['class'] );
	
	        console.log(JSON.stringify(jsonresult, null, 2));
	        
	        res.write(
	          '<head><title>Visual Recognition Classifier ID Update</title><body>' +
	          '<br>Classifier ID : ' + classifier_id_saved +
	          '<br><button onclick="goBack()">Go Back</button>' +
	          '<script>function goBack() {window.history.back();}</script>' +
	          '</body></head>'
	        );
	        return res.end();
	      })
	      .catch(err => {
	        console.log('error:', err);
	        res.write(
	          '<head><title>Visual Recognition Classifier ID Update Error</title><body>' +
	          '<br>Classifier ID : ' + classifier_id_saved +
	          '<br><button onclick="goBack()">Go Back</button>' +
	          '<script>function goBack() {window.history.back();}</script>' +
	          '</body></head>'
	        );
	        return res.end();
	      });
	    }
	});
});

app.post('/DeleteClassifier', function(req, res) {
  var form = new formidable.IncomingForm();
  var selectvalue;
  form.parse(req, function (err, fields, files) {

    selectvalue = fields['select_classifyid']; // get input from select
    
    for(var i=0; i<array_classifier_id.length; i++){
      if(selectvalue == ("custom" + i)){
        classifier_id_saved = array_classifier_id[i];
        var threshold = 0.0;
      }
    }

    const deleteClassifierParams = {
      classifierId: classifier_id_saved,
    };

    visualRecognition.deleteClassifier(deleteClassifierParams)
    .then(result => {

      client.query('delete from VR_Classifier where id="' + classifier_id_saved + '"', function(error, result){
        if(error){ console.log('Error in DB Query');
        }else{
          console.log('deleted classifier ID:' + classifier_id_saved);
          // update in DB html
          temp_str='';
          array_classifier_id = [];
          client.query('select * from VR_Classifier', function(error, result){
            if(error){ console.log('Error in DB Query');
            }else{
              console.log('length after db update: ' + result.length);
              for(var i=0; i<result.length; i++){
                console.log('id in DB : ' + result[i]['id']);
                temp_str += '<option value="custom' + i + '">' + result[i]["id"]+ '</option>';
                array_classifier_id.push(result[i]["id"]);
              }
            }
          });
          console.log('updated html: ' + temp_str);
          console.log(JSON.stringify(result, null, 2));
          res.write(
            '<head><title>Visual Recognition Classifier ID Delete</title><body>' +
            '<br>Classifier ID : ' + classifier_id_saved +
            '<br><button onclick="goBack()">Go Back</button>' +
            '<script>function goBack() {window.location.replace(document.referrer);} </script>' +
            '</body></head>'
          );
        
        return res.end();
        }
      });
    })
    .catch(err => {
      console.log('error:', err);
    });

  });
});




app.get('/', function(req, res){

  console.log('First html: ' + temp_str);
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write(
    '<head><title>Visual_Recognition Function Test</title><body>' +

    '<form action="fileClassify" method="post" enctype="multipart/form-data">' +
      '<fieldset><legend>For Image Classification</legend><br>' +
      'Will classify the placed image file<br><br>' +
      'Attach file: ' + 
      '<input type="file" name="filetoupload"><br><br>' +
      'Select classify ID: <select name ="select_classifyid">' + 
        '<option value="none">none</option>' +
        '<option value="food">food</option>' +
        '<option value="explicit">explicit</option>' + temp_str +
        '</select><br><br>' +
      '<input type="submit" value="Submit Image">' +
    '<br></fieldset>' +
    '</form>'
  );  

  res.write(
    '<br>' + 
    '<form action="CreateTrainClassifier" method="post" enctype="multipart/form-data">' +
      '<fieldset><legend>For Classifier ID Creation</legend><br>' +
      'Will create and train Classifier<br><br>' +
      'Attach positive image zip file: ' +
      '<input type="file" name="filetoupload_positive" multiple="multiple"><br><br>' +
      'Attach negative image zip file: ' +
      '<input type="file" name="filetoupload_negative" multiple="multiple"><br><br>' +

      'Select classify ID: <select name ="select_classifyid">' +
        temp_str +
        '<option value="new_classifier_ID">new classifier ID</option>' +
        '</select><br><br>' +

      '<input type="submit" value="Submit Image">' +
      '<br></fieldset>' +
      '</form>'
  );

  res.write(
    '<br>' +
    '<form action="DeleteClassifier" method="post" enctype="multipart/form-data">' +
      '<fieldset><legend>For Classifier ID Delete</legend><br>' +
      'Will delete Classifier<br><br>' +
      'Select classify ID: <select name ="select_classifyid">' +
        temp_str +
        '</select><br><br>' +

      '<input type="submit" value="Delete">' +
      '<br></fieldset>' +
      '</form>'
  );


  res.write(
    '</body></head>'
  );
  return res.end();
});

app.listen(3000, function(){
  console.log('Server running at port 3000');
});

