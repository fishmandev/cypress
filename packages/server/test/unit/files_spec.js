require('../spec_helper')

const config = require(`${root}lib/config`)
const files = require(`${root}lib/files`)
const { fs } = require(`${root}lib/util/fs`)
const FixturesHelper = require('@tooling/system-tests/lib/fixtures')

describe('lib/files', () => {
  beforeEach(function () {
    FixturesHelper.scaffold()

    this.todosPath = FixturesHelper.projectPath('todos')

    return config.get(this.todosPath).then((cfg) => {
      this.config = cfg;
      ({ projectRoot: this.projectRoot } = cfg)
    })
  })

  afterEach(() => {
    return FixturesHelper.remove()
  })

  context('#readFile', () => {
    it('returns contents and full file path', function () {
      return files.readFile(this.projectRoot, 'tests/_fixtures/message.txt').then(({ contents, filePath }) => {
        expect(contents).to.eq('foobarbaz')

        expect(filePath).to.include('/.projects/todos/tests/_fixtures/message.txt')
      })
    })

    it('returns uses utf8 by default', function () {
      return files.readFile(this.projectRoot, 'tests/_fixtures/ascii.foo').then(({ contents }) => {
        expect(contents).to.eq('\n')
      })
    })

    it('uses encoding specified in options', function () {
      return files.readFile(this.projectRoot, 'tests/_fixtures/ascii.foo', { encoding: 'ascii' }).then(({ contents }) => {
        expect(contents).to.eq('o#?\n')
      })
    })

    // https://github.com/cypress-io/cypress/issues/1558
    it('explicit null encoding is sent to driver as a Buffer', function () {
      return files.readFile(this.projectRoot, 'tests/_fixtures/ascii.foo', { encoding: null }).then(({ contents }) => {
        expect(contents).to.eql(Buffer.from('\n'))
      })
    })

    it('parses json to valid JS object', function () {
      return files.readFile(this.projectRoot, 'tests/_fixtures/users.json').then(({ contents }) => {
        expect(contents).to.eql([
          {
            id: 1,
            name: 'brian',
          }, {
            id: 2,
            name: 'jennifer',
          },
        ])
      })
    })

    it('aborts readFn execution if not complete within the specified timeout', function () {
      const mockTimeoutId = 4567

      sinon.stub(global, 'setTimeout').callsFake(function syncTimeout (funcArg) {
        // execute timeout function synchronously so that abort signal is aborted prior
        // to outputFile execution
        funcArg()

        return mockTimeoutId
      })

      sinon.stub(global, 'clearTimeout')

      return files.readFile(this.projectRoot, 'tests/_fixtures/message.txt', { timeout: 100 }).catch((err) => {
        expect(err.name).to.equal('AbortError')
        expect(err.aborted).to.equal(true)
        expect(err.filePath).to.include('tests/_fixtures/message.txt')
        expect(global.clearTimeout).to.have.been.calledWith(mockTimeoutId)
      })
    })

    it('catches generic errors from readFn and appends filePath', function () {
      sinon.stub(fs, 'readFileAsync').callsFake(function mockReadFile (path, options, callback) {
        callback(new Error('UnexpectedError: How could this happen'), undefined)
      })

      sinon.stub(global, 'clearTimeout')

      return files.readFile(this.projectRoot, 'tests/_fixtures/message.txt').catch((err) => {
        expect(err.message).to.equal('UnexpectedError: How could this happen')
        expect(err.aborted).to.equal(undefined)
        expect(err.filePath).to.include('tests/_fixtures/message.txt')
        expect(global.clearTimeout).to.have.been.calledWith(undefined)
      })
    })
  })

  context('#writeFile', () => {
    it('writes the file\'s contents and returns contents and full file path', function () {
      return files.writeFile(this.projectRoot, '.projects/write_file.txt', 'foo').then(() => {
        return files.readFile(this.projectRoot, '.projects/write_file.txt').then(({ contents, filePath }) => {
          expect(contents).to.equal('foo')

          expect(filePath).to.include('/.projects/todos/.projects/write_file.txt')
        })
      })
    })

    it('uses encoding specified in options', function () {
      return files.writeFile(this.projectRoot, '.projects/write_file.txt', '', { encoding: 'ascii' }).then(() => {
        return files.readFile(this.projectRoot, '.projects/write_file.txt').then(({ contents }) => {
          expect(contents).to.equal('�')
        })
      })
    })

    // https://github.com/cypress-io/cypress/issues/1558
    it('explicit null encoding is written exactly as received', function () {
      return files.writeFile(this.projectRoot, '.projects/write_file.txt', Buffer.from(''), { encoding: null }).then(() => {
        return files.readFile(this.projectRoot, '.projects/write_file.txt', { encoding: null }).then(({ contents }) => {
          expect(contents).to.eql(Buffer.from(''))
        })
      })
    })

    it('overwrites existing file by default', function () {
      return files.writeFile(this.projectRoot, '.projects/write_file.txt', 'foo').then(() => {
        return files.readFile(this.projectRoot, '.projects/write_file.txt').then(({ contents }) => {
          expect(contents).to.equal('foo')

          return files.writeFile(this.projectRoot, '.projects/write_file.txt', 'bar').then(() => {
            return files.readFile(this.projectRoot, '.projects/write_file.txt').then(({ contents }) => {
              expect(contents).to.equal('bar')
            })
          })
        })
      })
    })

    it('appends content to file when specified', function () {
      return files.writeFile(this.projectRoot, '.projects/write_file.txt', 'foo').then(() => {
        return files.readFile(this.projectRoot, '.projects/write_file.txt').then(({ contents }) => {
          expect(contents).to.equal('foo')

          return files.writeFile(this.projectRoot, '.projects/write_file.txt', 'bar', { flag: 'a+' }).then(() => {
            return files.readFile(this.projectRoot, '.projects/write_file.txt').then(({ contents }) => {
              expect(contents).to.equal('foobar')
            })
          })
        })
      })
    })

    it('aborts outputFile execution if not complete within the specified timeout', function () {
      sinon.stub(global, 'setTimeout').callsFake(function syncTimeout (funcArg) {
        // execute timeout function synchronously so that abort signal is aborted prior
        // to outputFile execution
        funcArg()

        // returned timeoutId is synchronized with clearTimeout assertion below
        return 12345
      })

      sinon.stub(global, 'clearTimeout')

      return files.writeFile(this.projectRoot, '.projects/write_file.txt', 'foo', { timeout: 100 }).catch((err) => {
        expect(err.name).to.equal('AbortError')
        expect(err.aborted).to.equal(true)
        expect(err.filePath).to.include('.projects/todos/.projects/write_file.txt')
        expect(global.clearTimeout).to.have.been.calledWith(12345)
      })
    })

    it('catches generic errors from outputFile and appends filePath', function () {
      sinon.stub(fs, 'outputFile').rejects(new Error('UnexpectedError: How could this happen'))
      sinon.stub(global, 'clearTimeout')

      return files.writeFile(this.projectRoot, '.projects/write_file.txt', 'foo').catch((err) => {
        expect(err.message).to.equal('UnexpectedError: How could this happen')
        expect(err.aborted).to.equal(undefined)
        expect(err.filePath).to.include('.projects/todos/.projects/write_file.txt')
        expect(global.clearTimeout).to.have.been.calledWith(undefined)
      })
    })
  })
})
