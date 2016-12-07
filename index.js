const nodemailer = require('nodemailer');
const config = require('./config');
const fs = require('fs');
const async = require('async');
const ejs = require('ejs');
const htmlToText = require('html-to-text');
const transporter = nodemailer.createTransport(config.mail.transport);
const request = require('request');

async.waterfall([
  function(next) {
    setupTemplate(next);
  },
  function(template,next) {
    gatherParticipants(function(err,people) {
      next(err,people,template)
    })
  },
  sendEmails
],function(err) {
  if (err) {
    console.error(err);
    process.exit(-1);
  } else {
    process.exit(0);
  }
});

function setupTemplate(next) {
  fs.readFile('./index.ejs',{'encoding':'utf8'},next);
}

function gatherParticipants(done) {
  if (config.dryRun.participants) {
    done(null,[
      {
        'firstname': {'value':'John'},
        'lastname': {'value':'Jones'},
        'email': {'value':'johnjones4@gmail.com'},
      }
    ]);
  } else {
    var participants = [];
    var doRequest = function(lastVid) {
      const params = {
        'hapikey': config.hubspotKey,
        'property': [
          'Published',
          'FirstName',
          'LastName',
          'Email',
          'no_contact'
        ],
        'count': 100,
        'vidOffset': lastVid
      }
      request({
        'uri': 'https://api.hubapi.com/contacts/v1/lists/all/contacts/all',
        'qs': params,
        'useQuerystring': true,
        'json': true
      },function(err,res,body) {
        if (err) {
          done(err);
        } else if (body.contacts && body.contacts.length > 0) {
          participants = participants.concat(
            body.contacts
              .filter(function(contact) {
                return contact.properties.published && (contact.properties.published.value+'').trim().length > 0 && (!contact.properties.no_contact || !contact.properties.no_contact.value);
              })
              .map(function(contact) {
                return contact.properties;
              })
          );
          doRequest(body.contacts[body.contacts.length - 1].vid);
        } else {
          done(null,participants);
        }
      });
    }
    doRequest(null);
  }
}

function sendEmails(people,template,done) {
  async.series(
    people.map(function(person) {
      return function(next) {
        console.log(person.email.value);
        const templateVariables = {
          'person': person,
          'links': config.links
        };
        const html = ejs.render(template, templateVariables);
        const mailData = {
          "from": config.mail.message.from,
          "to": person.firstname.value + ' ' + person.lastname.value + ' <' + person.email.value + '>',
          "subject": config.mail.message.subject,
          "html": html,
          "text": htmlToText.fromString(html)
        };
        if (config.dryRun.send) {
          console.log('======================================================');
          // console.log(mailData);
          next();
        } else {
          transporter.sendMail(mailData,function(err,info) {
            if (err) {
              console.error(err);
            }
            next();
          });
        }
      }
    }),
    done
  );
}
