require('dotenv').config()
const fs = require('fs')
const path = require('path')
const Json2csvParser = require('json2csv').Parser;
const github = require('@octokit/rest')({
  headers: {
    accept: 'application/vnd.github.hellcat-preview+json'
  },
  //Set this to GHE url
  baseUrl: ''
})
require('./pagination')(github)

github.authenticate({
  type: 'token',
  token: process.env.ghToken
})

var table = []

async function getData() {
  const orgs = [].concat.apply([], (await github.paginate(github.orgs.getAll())).map(d => d.data.map(n => n.login)))
  const members = [].concat.apply([], (await github.paginate(github.users.getAll())).map(d => d.data.map(n => n.login)))

  var memberNames = []

  for (const org of orgs) {
    //Get all repositories for the organization
    var repos = [].concat.apply([], (await github.paginate(github.repos.getForOrg({
      org: org
    }))).map(d => d.data.map(r => r)))

    for (const repo of repos) {
      //Pull a list of teams and their access to the current repository
      const repoTeams = [].concat.apply([], (await github.paginate(github.repos.getTeams({
        owner: org,
        repo: repo.name
      }))).map(d => d.data.map(t => t)))

      //Pull a list of outside collaborators for the current repository
      const repoCollabs = [].concat.apply([], (await github.paginate(github.repos.getCollaborators({
        owner: org,
        repo: repo.name,
        affiliation: 'outside'
      }))).map(d => d.data.map(c => c)))

      //Loop teams and query permissions and members
      for (const team of repoTeams) {
        const memberData = await github.paginate(github.orgs.getTeamMembers({
          id: team.id
        }))

        memberNames = [].concat.apply([], memberData.map(d => d.data.map(n => n.login)))

        var repoData = await github.paginate(github.orgs.getTeamRepos({
          id: team.id
        }))

        const teamOrg = (await github.orgs.getTeam({
          id: team.id
        })).data.organization.login

        table.push({
          org: org,
          team: team.name,
          member: memberNames[0],
          repo: repo.name,
          type: 'MEMBER',
          permission: team.permission
        })
      }

      for (const collab of repoCollabs) {
        table.push({
          org: org,
          team: 'N/A',
          member: collab.login,
          repo: repo.name,
          type: 'COLLAB',
          permission: 'Push' //Placeholder
        })
      }
    }
  }

  //get member repositories
  for (const member of members) {

    const memberRepos = await github.paginate(github.repos.getForUser({
      username: member,
      type: 'all'
    }))

    memberRepo = [].concat.apply([], memberRepos.map(d => d.data.map(n => n.name)))

    for (const repo of memberRepo) {
      console.log('Personal', member, member, repo, 'Owner')
    }
  }
}

getData().then(function() {
  //Remove Duplicates
  table = table.filter((table, index, self) =>
    index === self.findIndex((t) => (
      t.repo === table.repo && t.user === table.user && t.team === table.team
    ))
  )

  //Sort by Team 
  table.sort(function (a, b) {
    return a.repo > b.repo ? 1 : b.repo > a.repo ? -1 : 0;
  });

  //Write to CSV file
  var jsonResults = JSON.stringify(table)
  const fields = ['repo', 'type', 'team', 'user', 'permission']
  var json2csvParser = new Json2csvParser({
    fields,
    delimiter: ';'
  })
  const csv = json2csvParser.parse(table)
  console.log(csv)
  fs.writeFile('repo-permissions.csv', csv, function (err) {
    if (err) throw err
    console.log('file saved!')
  })
})
