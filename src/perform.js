var async = require('async');
var cwd = require('process').cwd;
var path = require('path');
var fs = require('fs');
var shell = require('shelljs');

var Repository = require('lerna/lib/Repository').default;
var PackageUtilities = require('lerna/lib/PackageUtilities').default;

var makeTag = require('./utils/make-tag');

function pushTags (done) {
  shell.exec('git push origin --tags', function (code) {
    done(code === 0 ? null : code);
  });
}

function publishPackage (path, done) {
  shell.exec('npm publish ' + path, function (code) {
    done(code === 0 ? null : code);
  });
}

function isPackageUpdated (pkg, cb) {
  var npmVersion = shell.exec(['npm view', pkg.name, 'version'].join(' '), {silent: true});
  var outOfDate = npmVersion.stdout.trim() !== pkg.version;
  console.log(pkg.name, outOfDate ? 'is out of date' : 'is up to date');
  cb(null, {pkg: pkg, updated: outOfDate}); //if it 404's, it's !==, therefore new
}

function getUpdatedPackages (done) {
  var packagesLocation = new Repository().packagesLocation;
  var allPackages = PackageUtilities.getPackages(packagesLocation);

  async.parallel(allPackages.map(function (pkg) {
    return function getLatestVersion (done) {
      isPackageUpdated(pkg, done);
    }
  }), function gotLatestVersions (err, results) {
    var updatedPackages = results.filter(function (result) {
      return result.updated;
    }).map(function (result) {
      return result.pkg;
    });
    done(null, updatedPackages);
  });
}

function publishUpdatedPackages (updatedPackages, done) {
  console.log('Publishing', updatedPackages.length, 'updated packages');

  var updatedPackageLocations = updatedPackages.map(function (pkg) {
    return pkg.location
  });

  var updatedPackageRelativeLocations = updatedPackageLocations.map(function (location) {
    return path.relative(cwd(), location);
  });

  var releasedPackages = updatedPackages.map(function (pkg) {
    return makeTag(pkg.name, pkg.version);
  });

  async.series(updatedPackageRelativeLocations.map(function (path) {
    return function (packagePublishedCallback) {
      publishPackage(path, packagePublishedCallback)
    };
  }), function (err) {
    done(err, releasedPackages)
  });
}

function writeReleasedPackagesFile (releasedPackages, done) {
  fs.writeFile('.released-packages', releasedPackages.join('\n'), done);
}


module.exports = function perform () {
  async.waterfall([
    pushTags,
    getUpdatedPackages,
    publishUpdatedPackages,
    writeReleasedPackagesFile
  ]);
};