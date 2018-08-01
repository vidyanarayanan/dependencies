/**
 * Created by i841928 on 9/11/17.
 */
class ScanResultEntry {


    constructor(repo, module, version, dependencyType, searchResultType, synonym, allowedVersions) {
        this.repo = repo;
        this.module = module;
        this.version = version;
        this.dependencyType = dependencyType;
        this.searchResultType = searchResultType;
        this.synonym = synonym;
        this.allowedVersions = allowedVersions;
    }


    get csvString() {
        return this.createCSVString();
    }


    createCSVString() {
        const csvLine = this.repo + ', ' + this.module + ', ' + this.version + ', ' + this.dependencyType + ', ' + this.searchResultType + this.synonym + ', ' + this.allowedVersions;
        return csvLine;
    }

    // let sce = new ScanResultEntry('r', 'm', '1.1', 'runtime', 'Not Found', ' ', [2.0, 3.0])
    
}

module.exports.ScanResultEntry = ScanResultEntry;


